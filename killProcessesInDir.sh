#!/usr/bin/env bash
set +e
dir=${JSON.stringify(dir)}
dir_real=$(cd "$dir" 2>/dev/null && pwd -P || echo "$dir")
roots=$(pgrep -f "$dir" 2>/dev/null; pgrep -f "$dir_real" 2>/dev/null)
cwd_roots=$(lsof -d cwd -Fpn 2>/dev/null | awk -v d1="$dir" -v d2="$dir_real" '
  /^p/ { pid = substr($0, 2); next }
  /^n/ { cwd = substr($0, 2); if (index(cwd, d1) == 1 || index(cwd, d2) == 1) print pid }
')
roots=$(printf '%s\n%s\n' "$roots" "$cwd_roots" | grep -E '^[0-9]+$' | sort -u)
[ -z "$roots" ] && exit 0
all="$roots"; frontier="$roots"
for _ in 1 2 3 4 5 6 7 8; do
  [ -z "$frontier" ] && break
  kids=$(printf '%s\n' $frontier | xargs -n1 pgrep -P 2>/dev/null | grep -E '^[0-9]+$' | sort -u)
  [ -z "$kids" ] && break
  new=$(printf '%s\n' $kids | grep -vxF -f <(printf '%s\n' $all) 2>/dev/null)
  [ -z "$new" ] && break
  all=$(printf '%s\n%s\n' "$all" "$new" | sort -u)
  frontier="$new"
done
printf '%s\n' $all | xargs kill 2>/dev/null
sleep 0.5
printf '%s\n' $all | xargs kill -9 2>/dev/null
exit 0