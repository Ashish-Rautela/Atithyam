#!/bin/sh
# Container entrypoint. With USE_XVFB=1 it starts a virtual display first, so the worker can run a
# normal (headed) Chromium on a server - sites challenge headless browsers far more often.
# Node stays the main process, so `docker stop` (SIGTERM) reaches the worker and it can hand its
# running jobs back to the queue.
set -e

if [ "${USE_XVFB:-0}" = "1" ]; then
  if command -v Xvfb >/dev/null 2>&1; then
    export DISPLAY="${DISPLAY:-:99}"
    Xvfb "$DISPLAY" -screen 0 1366x900x24 -nolisten tcp -ac >/tmp/xvfb.log 2>&1 &
    i=0
    while [ ! -e "/tmp/.X11-unix/X${DISPLAY#:}" ] && [ "$i" -lt 50 ]; do
      sleep 0.1
      i=$((i + 1))
    done
    echo "Virtual display $DISPLAY ready; Chromium runs headed"
  else
    echo "Xvfb is not installed in this image; Chromium runs headless" >&2
    export HEADLESS=true
  fi
fi

exec "$@"
