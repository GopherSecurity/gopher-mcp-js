#!/usr/bin/env bash

resolve_native_library_dir() {
  local project_dir="$1"
  local platform arch platform_dir
  local current_dir="${project_dir}/native/current/lib"
  local compat_dir="${project_dir}/native/lib"

  platform="$(uname -s)"
  arch="$(uname -m)"
  case "${platform}:${arch}" in
    Darwin:arm64) platform_dir="${project_dir}/native/darwin-arm64/lib" ;;
    Darwin:x86_64) platform_dir="${project_dir}/native/darwin-x64/lib" ;;
    Linux:x86_64|Linux:amd64) platform_dir="${project_dir}/native/linux-x64/lib" ;;
    *) platform_dir="" ;;
  esac

  if [ -n "${platform_dir}" ] && [ -d "${platform_dir}" ]; then
    printf '%s\n' "${platform_dir}"
    return 0
  fi

  if [ -d "${current_dir}" ]; then
    printf '%s\n' "${current_dir}"
    return 0
  fi

  if [ -d "${compat_dir}" ]; then
    printf '%s\n' "${compat_dir}"
    return 0
  fi

  echo "Error: Native library directory not found." >&2
  echo "Checked:" >&2
  if [ -n "${platform_dir}" ]; then
    echo "  ${platform_dir}" >&2
  fi
  echo "  ${current_dir}" >&2
  echo "  ${compat_dir}" >&2
  echo "Run ./build.sh first." >&2
  return 1
}

resolve_native_library_file() {
  local project_dir="$1"
  local lib_name="$2"
  local platform arch platform_dir current_dir compat_dir native_dir match

  platform="$(uname -s)"
  arch="$(uname -m)"
  case "${platform}:${arch}" in
    Darwin:arm64) platform_dir="${project_dir}/native/darwin-arm64/lib" ;;
    Darwin:x86_64) platform_dir="${project_dir}/native/darwin-x64/lib" ;;
    Linux:x86_64|Linux:amd64) platform_dir="${project_dir}/native/linux-x64/lib" ;;
    *) platform_dir="" ;;
  esac
  current_dir="${project_dir}/native/current/lib"
  compat_dir="${project_dir}/native/lib"

  for native_dir in "${platform_dir}" "${current_dir}" "${compat_dir}"; do
    [ -n "${native_dir}" ] || continue
    [ -d "${native_dir}" ] || continue

    if [ -e "${native_dir}/${lib_name}" ]; then
      printf '%s\n' "${native_dir}/${lib_name}"
      return 0
    fi

    match="$(find "${native_dir}" -maxdepth 1 -name "${lib_name}*" -type f 2>/dev/null | sort | head -n 1)"
    if [ -n "${match}" ]; then
      printf '%s\n' "${match}"
      return 0
    fi
  done

  echo "Error: Native library file not found: ${lib_name}" >&2
  echo "Checked:" >&2
  for native_dir in "${platform_dir}" "${current_dir}" "${compat_dir}"; do
    [ -n "${native_dir}" ] || continue
    echo "  ${native_dir}" >&2
  done
  return 1
}
