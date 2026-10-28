# -*- coding: utf-8 -*-
"""用 Chrome DevTools Protocol 截图（无需第三方库）。"""
import base64, json, os, socket, struct, subprocess, sys, time, urllib.request, shutil, tempfile

CHROME = "/usr/bin/google-chrome"

class WS:
    def __init__(self, url):
        rest = url[5:]
        hostport, path = rest.split("/", 1)
        path = "/" + path
        host, port = hostport.split(":")
        self.s = socket.create_connection((host, int(port)), timeout=60)
        key = base64.b64encode(os.urandom(16)).decode()
        req = ("GET %s HTTP/1.1\r\nHost: %s\r\nUpgrade: websocket\r\n"
               "Connection: Upgrade\r\nSec-WebSocket-Key: %s\r\n"
               "Sec-WebSocket-Version: 13\r\n\r\n" % (path, hostport, key))
        self.s.sendall(req.encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            c = self.s.recv(4096)
            if not c:
                raise EOFError("handshake failed")
            buf += c
        self.buf = buf.split(b"\r\n\r\n", 1)[1]

    def send(self, obj):
        data = json.dumps(obj).encode()
        n = len(data)
        hdr = bytearray([0x81])
        mask = os.urandom(4)
        if n < 126:
            hdr.append(0x80 | n)
        elif n < 65536:
            hdr.append(0x80 | 126); hdr += struct.pack(">H", n)
        else:
            hdr.append(0x80 | 127); hdr += struct.pack(">Q", n)
        hdr += mask
        self.s.sendall(bytes(hdr) + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

    def _read(self, n):
        while len(self.buf) < n:
            c = self.s.recv(1 << 20)
            if not c:
                raise EOFError("socket closed")
            self.buf += c
        d, self.buf = self.buf[:n], self.buf[n:]
        return d

    def recv(self):
        while True:
            b0, b1 = self._read(2)
            fin = b0 & 0x80
            op = b0 & 0x0F
            ln = b1 & 0x7F
            if ln == 126:
                ln = struct.unpack(">H", self._read(2))[0]
            elif ln == 127:
                ln = struct.unpack(">Q", self._read(8))[0]
            payload = self._read(ln) if ln else b""
            if op == 0x8:
                raise EOFError("ws closed")
            if op == 0x9 or op == 0xA:
                continue
            if op in (0x1, 0x2):
                if not fin:
                    frags = [payload]
                    while True:
                        b0, b1 = self._read(2)
                        f2 = b0 & 0x80
                        l2 = b1 & 0x7F
                        if l2 == 126:
                            l2 = struct.unpack(">H", self._read(2))[0]
                        elif l2 == 127:
                            l2 = struct.unpack(">Q", self._read(8))[0]
                        frags.append(self._read(l2) if l2 else b"")
                        if f2:
                            break
                    payload = b"".join(frags)
                return payload.decode("utf-8", "replace")


class CDP:
    def __init__(self, port=9333):
        self.mid = 0
        for _ in range(60):
            try:
                d = json.loads(urllib.request.urlopen("http://127.0.0.1:%d/json/list" % port, timeout=2).read())
                pages = [t for t in d if t.get("type") == "page"]
                if pages:
                    self.ws = WS(pages[0]["webSocketDebuggerUrl"])
                    return
            except Exception:
                pass
            time.sleep(0.4)
        raise RuntimeError("chrome 未就绪")

    def call(self, method, params=None, timeout=90):
        self.mid += 1
        mid = self.mid
        self.ws.send({"id": mid, "method": method, "params": params or {}})
        t0 = time.time()
        while time.time() - t0 < timeout:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == mid:
                if "error" in msg:
                    raise RuntimeError("%s -> %s" % (method, msg["error"]))
                return msg.get("result", {})
        raise TimeoutError(method)

    def eval(self, expr):
        r = self.call("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True})
        return r.get("result", {}).get("value")

    # ---------- 事件流（录屏用）----------
    def start_screencast(self, width, height, fmt="png", quality=92, every=1):
        """开一路 screencast。它由合成器推帧，不像 captureScreenshot 那样
        每次强制同步渲染 —— 后者在 swiftshader 下每帧要多花 ~275ms。"""
        self.call("Page.startScreencast", {
            "format": fmt, "quality": quality, "maxWidth": width,
            "maxHeight": height, "everyNthFrame": every
        })

    def stop_screencast(self):
        try:
            self.call("Page.stopScreencast", {}, timeout=10)
        except Exception:
            pass

    def pump_frames(self, want=9999, duration=None, idle_timeout=8.0, total_timeout=180.0):
        """收帧，返回 [(timestamp, bytes), …]。

        duration 给定时，按**首帧时间戳**起算，够了就停（比按墙钟稳，
        因为 socket 收包有抖动）。每帧必须回 ack，否则 Chrome 只推一帧就停。
        阻塞读是安全的：screencast 会持续推，真卡住就靠 socket 超时报错退出
        （不要吞掉超时后继续读 —— 半帧会让后续解析错位）。"""
        out = []
        t0 = time.time()
        t_first = None
        self.ws.s.settimeout(idle_timeout)
        try:
            while len(out) < want:
                if time.time() - t0 > total_timeout:
                    break
                msg = json.loads(self.ws.recv())
                if msg.get("method") != "Page.screencastFrame":
                    continue
                p = msg["params"]
                stamp = p["metadata"].get("timestamp", time.time())
                if t_first is None:
                    t_first = stamp
                out.append((stamp, base64.b64decode(p["data"])))
                self.ws.send({"id": -len(out) - 1000,
                              "method": "Page.screencastFrameAck",
                              "params": {"sessionId": p["sessionId"]}})
                if duration and stamp - t_first >= duration:
                    break
        finally:
            self.ws.s.settimeout(60)
            self.stop_screencast()
        return out


def launch(size=(1600, 950), scale=1, port=9333):
    """启动一个 headless Chrome 并连上 CDP。返回 (进程, CDP 连接)。"""
    prof = tempfile.mkdtemp(prefix="cdpshot")
    args = [CHROME, "--headless=new", "--disable-gpu", "--enable-unsafe-swiftshader",
            "--no-sandbox", "--no-first-run", "--disable-dev-shm-usage",
            "--hide-scrollbars", "--force-device-scale-factor=%s" % scale,
            "--remote-debugging-port=%d" % port, "--user-data-dir=" + prof,
            "--window-size=%d,%d" % size, "about:blank"]
    p = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    c = CDP(port)
    c.profile_dir = prof
    return p, c


def close_chrome(p, prof):
    p.terminate()
    try:
        p.wait(timeout=6)
    except Exception:
        p.kill()
    shutil.rmtree(prof, ignore_errors=True)


def shoot(url, out, wait=4.5, size=(1600, 950), script=None, scale=1):
    p, c = launch(size, scale)
    try:
        c.call("Page.enable")
        c.call("Runtime.enable")
        c.call("Emulation.setDeviceMetricsOverride",
               {"width": size[0], "height": size[1], "deviceScaleFactor": scale, "mobile": False})
        c.call("Page.navigate", {"url": url})
        time.sleep(wait)
        if script:
            print("eval:", c.eval(script))
            time.sleep(2.2)
        r = c.call("Page.captureScreenshot", {"format": "png", "captureBeyondViewport": False})
        with open(out, "wb") as f:
            f.write(base64.b64decode(r["data"]))
        errs = c.eval("JSON.stringify(window.__errs||[])")
        print("errors:", errs)
        print("saved:", out, os.path.getsize(out) // 1024, "KB")
    finally:
        close_chrome(p, c.profile_dir)


if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else "about:blank"
    out = sys.argv[2] if len(sys.argv) > 2 else "shot.png"
    script = sys.argv[3] if len(sys.argv) > 3 else None
    size = (1600, 950)
    if len(sys.argv) > 4 and "x" in sys.argv[4]:
        w, h = sys.argv[4].split("x")
        size = (int(w), int(h))
    shoot(url, out, script=script, size=size)
