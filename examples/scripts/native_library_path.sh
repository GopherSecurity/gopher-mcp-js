#!/usr/bin/env bash

resolve_native_library_dir() {
  local project_dir="$1"
  local current_dir="${project_dir}/native/current/lib"
  local compat_dir="${project_dir}/native/lib"

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
  echo "  ${current_dir}" >&2
  echo "  ${compat_dir}" >&2
  echo "Run ./build.sh first." >&2
  return 1
}

resolve_native_library_file() {
  local project_dir="$1"
  local lib_name="$2"
  local native_dir

  native_dir="$(resolve_native_library_dir "${project_dir}")" || return 1

  if [ -e "${native_dir}/${lib_name}" ]; then
    printf '%s\n' "${native_dir}/${lib_name}"
    return 0
  fi

  local match
  match="$(find "${native_dir}" -maxdepth 1 -name "${lib_name}*" -type f 2>/dev/null | sort | head -n 1)"
  if [ -n "${match}" ]; then
    printf '%s\n' "${match}"
    return 0
  fi

  echo "Error: Native library file not found: ${lib_name}" >&2
  echo "Native library directory: ${native_dir}" >&2
  return 1
}
