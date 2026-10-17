#!/usr/bin/env bash
# Run as root on the NEW Ubuntu 24.04 Parkick EC2 host, before uploading sources.
# Node binaries/checksums: https://nodejs.org/dist/latest-v22.x/
# PostgreSQL defaults: https://ubuntu.com/server/docs/how-to/databases/install-postgresql/
set -Eeuo pipefail
umask 022

if [[ ${EUID} -ne 0 ]]; then
  echo 'Run this script with sudo.' >&2
  exit 1
fi
. /etc/os-release
if [[ ${ID} != ubuntu || ${VERSION_ID} != 24.04 ]]; then
  echo 'This bootstrap supports a new Ubuntu 24.04 EC2 host only.' >&2
  exit 1
fi
case $(uname -m) in
  x86_64) node_arch=x64 ;;
  aarch64) node_arch=arm64 ;;
  *) echo 'Unsupported CPU architecture.' >&2; exit 1 ;;
esac

marker=/etc/parkick/bootstrap-managed
if [[ ! -f ${marker} ]] && { [[ -e /etc/parkick || -e /srv/parkick ]] || id parkick >/dev/null 2>&1; }; then
  echo 'Existing Parkick files/account found without a bootstrap marker; refusing to change them.' >&2
  exit 1
fi
if [[ ! -f ${marker} ]] && { command -v psql >/dev/null || command -v nginx >/dev/null || command -v node >/dev/null; }; then
  echo 'Expected a new host without PostgreSQL, Nginx or Node; review the existing installation first.' >&2
  exit 1
fi

install -d -o root -g root -m 0755 /etc/parkick /opt/parkick /var/lib/parkick-bootstrap
touch "${marker}"
chmod 0644 "${marker}"
export DEBIAN_FRONTEND=noninteractive
apt-get -o DPkg::Lock::Timeout=300 update
apt-get -o DPkg::Lock::Timeout=300 install -y ca-certificates curl xz-utils nginx postgresql postgresql-contrib build-essential python3

download_dir=$(mktemp -d /tmp/parkick-bootstrap.XXXXXXXX)
cleanup() {
  case ${download_dir} in /tmp/parkick-bootstrap.*) rm -rf -- "${download_dir}" ;; esac
}
trap cleanup EXIT
if [[ -s /etc/parkick/node-version ]]; then
  node_version=$(cat /etc/parkick/node-version)
  [[ ${node_version} =~ ^v22\.[0-9]+\.[0-9]+$ ]] || { echo 'Invalid saved Node version.' >&2; exit 1; }
  release_url="https://nodejs.org/dist/${node_version}"
else
  release_url=https://nodejs.org/dist/latest-v22.x
fi
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
  "${release_url}/SHASUMS256.txt" --output "${download_dir}/SHASUMS256.txt"
checksum_line=$(awk -v arch="${node_arch}" '$2 ~ ("^node-v22\\.[0-9]+\\.[0-9]+-linux-" arch "\\.tar\\.xz$") { print }' "${download_dir}/SHASUMS256.txt")
if [[ $(printf '%s\n' "${checksum_line}" | wc -l) -ne 1 || -z ${checksum_line} ]]; then
  echo 'Expected exactly one official Node 22 Linux archive checksum.' >&2
  exit 1
fi
archive_name=${checksum_line##* }
node_version=${archive_name#node-}
node_version=${node_version%-linux-*}
node_minor=${node_version#v22.}
node_minor=${node_minor%%.*}
[[ ${node_minor} -ge 18 ]] || { echo 'Node 22.18.0 or newer is required.' >&2; exit 1; }
install_path="/opt/parkick/${archive_name%.tar.xz}"
if [[ ! -x ${install_path}/bin/node ]]; then
  curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
    "https://nodejs.org/dist/${node_version}/${archive_name}" --output "${download_dir}/${archive_name}"
  (cd "${download_dir}" && printf '%s\n' "${checksum_line}" | sha256sum --check --status)
  tar --extract --xz --file "${download_dir}/${archive_name}" --directory /opt/parkick --no-same-owner
fi
for binary in node npm npx; do
  destination="/usr/local/bin/${binary}"
  if [[ -e ${destination} || -L ${destination} ]]; then
    case $(readlink "${destination}" || true) in
      /opt/parkick/node-v22.*/bin/*) ;;
      *) echo "Refusing to replace an unrelated ${destination}." >&2; exit 1 ;;
    esac
  fi
  ln -sfn "${install_path}/bin/${binary}" "${destination}"
done
printf '%s\n' "${node_version}" > /etc/parkick/node-version
if ! id parkick >/dev/null 2>&1; then
  useradd --system --user-group --create-home --home-dir /srv/parkick --shell /usr/sbin/nologin parkick
fi
install -d -o parkick -g parkick -m 0755 /srv/parkick /srv/parkick/app
install -d -o parkick -g parkick -m 0700 /var/lib/parkick /var/lib/parkick/reports
chown root:parkick /etc/parkick
chmod 0750 /etc/parkick

# Build headroom for the 2 GiB instance; this file stays on its encrypted EBS volume.
# Set PARKICK_ENABLE_SWAP=0 before the first run to skip it.
if [[ ${PARKICK_ENABLE_SWAP:-1} == 1 ]]; then
  swap_path=/var/lib/parkick-bootstrap/swapfile
  if [[ ! -e ${swap_path} ]]; then
    fallocate -l 2G "${swap_path}"
    chmod 0600 "${swap_path}"
    mkswap "${swap_path}" >/dev/null
  fi
  if ! swapon --show=NAME --noheadings | grep -Fxq "${swap_path}"; then
    swapon "${swap_path}"
  fi
  if ! grep -Fq "${swap_path} none swap sw 0 0" /etc/fstab; then
    printf '%s none swap sw 0 0\n' "${swap_path}" >> /etc/fstab
  fi
fi
systemctl enable --now postgresql
# Keep HTTP closed until the reviewed Nginx/HTTPS site is configured.
if [[ ! -e /etc/systemd/system/parkick-api.service ]]; then
  systemctl disable --now nginx
fi
printf 'Bootstrap complete: Node %s, PostgreSQL, Nginx, /srv/parkick/app.\n' "$(node --version)"
