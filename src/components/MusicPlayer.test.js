import React from "react";
import fs from "fs";
import path from "path";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react-dom/test-utils";
import MusicPlayer from "./MusicPlayer";
import profile from "../portfolio.config";

/**
 * 播放器组件测试：
 * APlayer 依赖真实音频环境，这里用一个轻量替身，只保留组件真正调用到的接口
 * （list.add / list.clear / list.switch / list.toggle / play / pause / toggle /
 *   skipBack / skipForward / seek / volume / lrc.show / lrc.hide / on）。
 * 解析服务通过 mock fetch 返回固定榜单，覆盖：
 *   1) 切换平台 → 清空列表 → 载入新榜单 → 自动播放；
 *   2) 点击 ✕ 只隐藏面板（不卸载、不销毁实例），重新展开后歌单与容器都还在；
 *   3) 重新展开时列表为空会自动重新拉取榜单；
 *   4) 点击 ↻ 先清空列表再重新请求当前榜单；
 *   5) 黑胶视觉：播放时进入旋转态（mp-is-playing）、暂停 / 播完回到静止态，
 *      并且隐藏 / 重新展开时状态与实例都不丢；
 *   6) 自绘控制条（lucide 图标 + flex 居中）：按钮结构 / 图标切换 / 上一曲下一曲 /
 *      循环模式轮转 / 播放列表开关 / 进度条 seek / 音量条，全部只走 APlayer 的公开 API；
 *   7) 样式契约：直接从 src/style.css 里断言「缩小后的尺寸、层级、flex 对齐、
 *      原生控制条已隐藏」这几条 jsdom 看不到的约定。
 */
const instances = [];

jest.mock("aplayer", () => {
  class FakePlayer {
    constructor(options) {
      this.options = { loop: "all", order: "list", ...options };
      this.handlers = {};
      this.calls = [];
      // 与真实 audio 元素一致：paused / currentTime / duration / volume 都可读可写
      this.audio = {
        volume: typeof options.volume === "number" ? options.volume : 1,
        src: "",
        paused: true,
        currentTime: 0,
        duration: NaN,
      };
      this.play = jest.fn(() => {
        this.calls.push("play");
        this.audio.paused = false; // 与真实 audio 一致：开始播放后 paused=false
      });
      this.pause = jest.fn(() => {
        this.calls.push("pause");
        this.audio.paused = true;
      });
      this.toggle = jest.fn(() => {
        this.calls.push("toggle");
        if (this.audio.paused) this.play();
        else this.pause();
      });
      this.skipBack = jest.fn(() => this.calls.push("skipBack"));
      this.skipForward = jest.fn(() => this.calls.push("skipForward"));
      this.seek = jest.fn((time) => {
        this.calls.push(`seek:${time}`);
        this.audio.currentTime = time;
      });
      this.volume = jest.fn((value) => {
        this.calls.push(`volume:${value}`);
        this.audio.volume = value;
        return value;
      });
      // 注意：真实 APlayer 的歌曲数组挂在 list 上（ap.list.audios），替身必须一致
      this.list = {
        audios: [],
        index: 0,
        hidden: true,
        add: (audios) => {
          this.calls.push("add");
          this.list.audios = this.list.audios.concat(audios);
        },
        clear: () => {
          this.calls.push("clear");
          this.list.audios = [];
          this.list.index = 0;
        },
        switch: (index) => {
          this.calls.push("switch");
          this.list.index = index;
          this.emit("listswitch", { index });
        },
        toggle: jest.fn(() => {
          this.calls.push("listToggle");
          this.list.hidden = !this.list.hidden;
        }),
      };
      this.lrc = { show: jest.fn(), hide: jest.fn() };
      instances.push(this);
    }

    on(name, handler) {
      this.handlers[name] = handler;
    }

    emit(name, payload) {
      if (this.handlers[name]) this.handlers[name](payload);
    }

    destroy() {
      this.destroyed = true;
    }
  }
  return { __esModule: true, default: FakePlayer };
});

const PLAYLISTS = {
  spotify: [{ id: "111", name: "Patient Zero", artist: "Artist A", url: "/music/api/stream?u=a", rawUrl: "https://api.injahow.cn/meting/?server=netease&type=url&id=111", pic: "https://p3.music.126.net/a.jpg", lrc: "/music/api/lrc?u=a", origin: "netease" }],
  "netease-hot": [
    { id: "222", name: "热歌一", artist: "歌手一", url: "/music/api/stream?u=b", rawUrl: "https://api.injahow.cn/meting/?server=netease&type=url&id=222", pic: "", lrc: "", origin: "netease" },
    { id: "333", name: "热歌二", artist: "歌手二", url: "/music/api/stream?u=c", rawUrl: "https://api.injahow.cn/meting/?server=netease&type=url&id=333", pic: "", lrc: "", origin: "netease" },
  ],
};

function mockPlaylistFetch() {
  global.fetch = jest.fn((url) => {
    const target = new URL(url, "http://localhost");
    const platform = target.searchParams.get("platform");
    // 兜底用的公共 Meting 实例返回的是「数组」，与真实一致
    if (!platform) {
      const songs = PLAYLISTS[target.searchParams.get("id") === "3778678" ? "netease-hot" : "spotify"];
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(songs) });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          ok: true,
          platform,
          count: PLAYLISTS[platform].length,
          songs: PLAYLISTS[platform],
        }),
    });
  });
}

beforeEach(() => {
  instances.length = 0;
  window.localStorage.clear();
  mockPlaylistFetch();
});

describe("MusicPlayer", () => {
  it("渲染平台下拉与分组，默认选中配置里的平台", async () => {
    render(<MusicPlayer />);

    const select = screen.getByLabelText("选择音乐平台与榜单");
    expect(select.value).toBe(profile.musicPlayer.defaultPlatform);
    expect(screen.getAllByRole("option")).toHaveLength(profile.musicPlayer.platforms.length);

    // 分组标签（Spotify / 网易云音乐 / QQ 音乐 / 抖音 / 纯音乐 / 汽水音乐）
    const groups = Array.from(new Set(profile.musicPlayer.platforms.map((item) => item.group)));
    groups.forEach((group) => {
      expect(screen.getByRole("group", { name: group })).toBeInTheDocument();
    });

    // 首屏只预加载、不自动播放（避免浏览器拦截与无谓打扰）
    await waitFor(() => expect(instances).toHaveLength(1));
    await waitFor(() => expect(instances[0].list.audios).toHaveLength(PLAYLISTS.spotify.length));
    // 首屏只有「清空 + 载入」，没有任何播放动作
    expect(instances[0].calls).toEqual(["clear", "add"]);
    expect(instances[0].play).not.toHaveBeenCalled();
  });

  it("切换平台时清空列表、载入新榜单并自动播放", async () => {
    render(<MusicPlayer />);
    await waitFor(() => expect(instances[0].list.audios).toHaveLength(PLAYLISTS.spotify.length));

    fireEvent.change(screen.getByLabelText("选择音乐平台与榜单"), { target: { value: "netease-hot" } });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("platform=netease-hot"),
        expect.anything()
      );
    });
    await waitFor(() => expect(instances[0].list.audios).toHaveLength(PLAYLISTS["netease-hot"].length));
    expect(instances[0].list.audios[0].name).toBe("热歌一");
    // 断言调用序列：清空 → 载入 → 从头播放
    expect(instances[0].calls).toEqual(["clear", "add", "clear", "add", "switch", "play"]);
    expect(screen.queryByText("重试")).not.toBeInTheDocument();
    expect(screen.getByText(`${PLAYLISTS["netease-hot"].length} 首`)).toBeInTheDocument();
  });

  it("解析服务不可用时给出错误提示与重试入口", async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error("网络不可用")));
    render(<MusicPlayer />);

    await waitFor(() => expect(screen.getByText("网络不可用")).toBeInTheDocument());
    expect(screen.getByText("重试")).toBeInTheDocument();
  });

  it("点击 ✕ 只把面板收起成挂件：保留 APlayer 实例与容器节点，重新展开歌单还在", async () => {
    render(<MusicPlayer />);
    await waitFor(() => expect(instances[0].list.audios).toHaveLength(PLAYLISTS.spotify.length));

    const panel = document.querySelector(".mp-panel");
    const stage = document.querySelector(".mp-aplayer");

    fireEvent.click(screen.getByLabelText("隐藏播放器"));

    // 面板仍留在 DOM 里（只是视觉隐藏），挂件出现，实例没有被销毁
    expect(document.querySelector(".mp-panel")).toBe(panel);
    expect(panel.className).toContain("mp-is-hidden");
    expect(screen.getByLabelText("打开音乐播放器")).toBeInTheDocument();
    expect(instances).toHaveLength(1);
    expect(instances[0].destroyed).toBeFalsy();

    // 重新展开：同一个面板 / 同一个 APlayer 容器，不需要也不应该重建实例
    fireEvent.click(screen.getByLabelText("打开音乐播放器"));

    expect(panel.className).not.toContain("mp-is-hidden");
    expect(document.querySelector(".mp-aplayer")).toBe(stage);
    expect(screen.queryByLabelText("打开音乐播放器")).not.toBeInTheDocument();
    expect(instances).toHaveLength(1);
    expect(instances[0].list.audios).toHaveLength(PLAYLISTS.spotify.length);
    expect(screen.getByText(`${PLAYLISTS.spotify.length} 首`)).toBeInTheDocument();
  });

  it("记住「已关闭」时首屏隐藏面板，但依然创建 APlayer 并预加载榜单", async () => {
    window.localStorage.setItem("shasha-music-player", JSON.stringify({ closed: true }));
    render(<MusicPlayer />);

    expect(document.querySelector(".mp-panel").className).toContain("mp-is-hidden");
    // 隐藏 ≠ 卸载：实例照建、榜单照拉，展开时不会出现空面板
    await waitFor(() => expect(instances).toHaveLength(1));
    await waitFor(() => expect(instances[0].list.audios).toHaveLength(PLAYLISTS.spotify.length));
  });

  it("重新展开时若列表为空，会按当前下拉榜单重新请求", async () => {
    render(<MusicPlayer />);
    await waitFor(() => expect(instances[0].list.audios).toHaveLength(PLAYLISTS.spotify.length));

    fireEvent.click(screen.getByLabelText("隐藏播放器"));
    instances[0].list.clear(); // 模拟列表为空（解析失败 / 被清空）
    const callsBefore = global.fetch.mock.calls.length;

    fireEvent.click(screen.getByLabelText("打开音乐播放器"));

    await waitFor(() => expect(global.fetch.mock.calls.length).toBeGreaterThan(callsBefore));
    expect(global.fetch.mock.calls[callsBefore][0]).toContain("platform=spotify");
    await waitFor(() => expect(instances[0].list.audios).toHaveLength(PLAYLISTS.spotify.length));
  });

  it("点击 ↻ 先清空当前列表，再重新请求当前榜单", async () => {
    render(<MusicPlayer />);
    await waitFor(() => expect(instances[0].list.audios).toHaveLength(PLAYLISTS.spotify.length));

    const callsBefore = global.fetch.mock.calls.length;
    fireEvent.click(screen.getByLabelText("重新加载榜单"));

    // 立刻清空（不保留旧列表），底部数量归零
    expect(instances[0].list.audios).toHaveLength(0);
    expect(screen.getByText("—")).toBeInTheDocument();

    await waitFor(() => expect(instances[0].list.audios).toHaveLength(PLAYLISTS.spotify.length));
    expect(global.fetch.mock.calls[callsBefore][0]).toContain("platform=spotify");
    // 首屏预加载 1 次 add + 重新加载 1 次 add
    expect(instances[0].calls.filter((name) => name === "add")).toHaveLength(2);
  });

  it("播放中点击 ↻，重新加载完成后继续播放", async () => {
    render(<MusicPlayer />);
    await waitFor(() => expect(instances[0].list.audios).toHaveLength(PLAYLISTS.spotify.length));

    act(() => instances[0].list.switch(0));
    instances[0].play(); // 进入「正在播放」状态（audio.paused = false）

    fireEvent.click(screen.getByLabelText("重新加载榜单"));

    await waitFor(() => expect(instances[0].list.audios).toHaveLength(PLAYLISTS.spotify.length));
    await waitFor(() => expect(instances[0].calls.slice(-2)).toEqual(["switch", "play"]));
  });

  it("黑胶唱机：播放时进入旋转态，暂停 / 播完回到静止态，唱针装饰常驻", async () => {
    render(<MusicPlayer />);
    await waitFor(() => expect(instances[0].list.audios).toHaveLength(PLAYLISTS.spotify.length));

    // 装饰层常驻 DOM：静止高光层 + 唱针（枢轴 / 唱臂 / 唱头）
    expect(document.querySelector(".mp-vinyl-sheen")).toBeInTheDocument();
    expect(document.querySelector(".mp-stylus .mp-stylus-pivot")).toBeInTheDocument();
    expect(document.querySelector(".mp-stylus .mp-stylus-arm .mp-stylus-head")).toBeInTheDocument();

    const panel = document.querySelector(".mp-panel");
    expect(panel.className).not.toContain("mp-is-playing");

    // APlayer 会把原生 audio 事件转发给 .on(...)：组件据此切「播放中」，
    // CSS 再用 animation-play-state / transform 让唱片旋转、唱针压下。
    act(() => {
      instances[0].audio.paused = false;
      instances[0].emit("play");
    });
    expect(panel.className).toContain("mp-is-playing");

    act(() => {
      instances[0].audio.paused = true;
      instances[0].emit("pause");
    });
    expect(panel.className).not.toContain("mp-is-playing");

    // 一首歌播完：同样回到静止态，不会一直空转
    act(() => {
      instances[0].audio.paused = false;
      instances[0].emit("play");
    });
    act(() => instances[0].emit("ended"));
    expect(panel.className).not.toContain("mp-is-playing");
  });

  it("黑胶唱机：隐藏 / 重新展开面板时播放状态与实例都不丢", async () => {
    render(<MusicPlayer />);
    await waitFor(() => expect(instances[0].list.audios).toHaveLength(PLAYLISTS.spotify.length));

    act(() => {
      instances[0].audio.paused = false;
      instances[0].emit("play");
    });

    const panel = document.querySelector(".mp-panel");
    const stage = document.querySelector(".mp-aplayer");
    expect(panel.className).toContain("mp-is-playing");

    fireEvent.click(screen.getByLabelText("隐藏播放器"));
    // 收起成挂件：音乐继续播（不暂停、不销毁实例），唱片旋转状态一并保留
    expect(instances[0].audio.paused).toBe(false);
    expect(instances[0].destroyed).toBeFalsy();
    expect(panel.className).toContain("mp-is-playing");

    fireEvent.click(screen.getByLabelText("打开音乐播放器"));
    expect(panel.className).toContain("mp-is-playing");
    expect(document.querySelector(".mp-aplayer")).toBe(stage);
    expect(instances).toHaveLength(1);
  });

  it("自绘控制条：五个 lucide SVG 按钮同处一个 flex 容器，播放键是实心主按钮", async () => {
    render(<MusicPlayer />);
    await waitFor(() => expect(instances[0].list.audios).toHaveLength(PLAYLISTS.spotify.length));

    // APlayer 原生控制条已经整条隐藏（样式契约那条用例里断言），面板里换成这块自绘控制条
    expect(document.querySelector("[data-mp-controls]")).toBeInTheDocument();

    const loop = screen.getByLabelText("循环模式：列表循环");
    const prev = screen.getByLabelText("上一曲");
    const main = screen.getByLabelText("播放");
    const next = screen.getByLabelText("下一曲");
    const list = screen.getByLabelText("播放列表");

    // 五个按钮同父容器（水平居中靠 CSS 的 flex + center + gap:8px）
    const row = main.parentElement;
    expect(row.className).toContain("mp-buttons");
    [loop, prev, next, list].forEach((button) => expect(button.parentElement).toBe(row));

    // 顺序：循环 / 上一曲 / 播放 / 下一曲 / 列表 —— 主按钮居中，左右各两个，严格对称
    expect(Array.from(row.children).map((node) => node.getAttribute("aria-label"))).toEqual([
      "循环模式：列表循环",
      "上一曲",
      "播放",
      "下一曲",
      "播放列表",
    ]);

    // 图标全部是内联 SVG（lucide-react），不再是「图标缺失」的空白方块
    [loop, prev, main, next, list].forEach((button) => {
      const svg = button.querySelector("svg");
      expect(svg).toBeInTheDocument();
      // stroke: currentColor → 颜色跟着按钮走，黑白主题自动适配
      expect(svg.getAttribute("stroke")).toBe("currentColor");
    });

    // 主按钮 36px 实心圆钮；副按钮 28px 透明描边圆钮
    expect(main.className).toContain("mp-btn-main");
    expect(prev.className).not.toContain("mp-btn-main");
  });

  it("播放 / 暂停：图标随播放状态切换，点击调 APlayer.toggle()", async () => {
    render(<MusicPlayer />);
    await waitFor(() => expect(instances[0].list.audios).toHaveLength(PLAYLISTS.spotify.length));

    fireEvent.click(screen.getByLabelText("播放"));
    expect(instances[0].toggle).toHaveBeenCalledTimes(1);

    // 与真实 APlayer 一致：toggle 之后还有原生 play 事件回来，React 据此换图标
    act(() => {
      instances[0].emit("play");
    });
    const pause = screen.getByLabelText("暂停");
    expect(pause.querySelector("svg").classList.contains("lucide-pause")).toBe(true);

    fireEvent.click(pause);
    act(() => {
      instances[0].emit("pause");
    });
    expect(
      screen.getByLabelText("播放").querySelector("svg").classList.contains("lucide-play")
    ).toBe(true);
    expect(instances[0].toggle).toHaveBeenCalledTimes(2);
  });


  it("上一曲 / 下一曲 / 播放列表：分别调 skipBack / skipForward / list.toggle()", async () => {
    render(<MusicPlayer />);
    await waitFor(() => expect(instances[0].list.audios).toHaveLength(PLAYLISTS.spotify.length));

    fireEvent.click(screen.getByLabelText("上一曲"));
    fireEvent.click(screen.getByLabelText("下一曲"));
    fireEvent.click(screen.getByLabelText("播放列表"));

    expect(instances[0].skipBack).toHaveBeenCalledTimes(1);
    expect(instances[0].skipForward).toHaveBeenCalledTimes(1);
    expect(instances[0].list.toggle).toHaveBeenCalledTimes(1);
    expect(instances[0].list.hidden).toBe(false);
  });

  it("循环按钮：列表循环 → 单曲循环 → 不循环，同步写回 APlayer.options.loop 并带角标", async () => {
    render(<MusicPlayer />);
    await waitFor(() => expect(instances[0].list.audios).toHaveLength(PLAYLISTS.spotify.length));

    const loopButton = () => document.querySelector("[data-loop-mode]");
    expect(loopButton().getAttribute("data-loop-mode")).toBe("all");
    expect(loopButton().querySelector(".mp-loop-badge")).not.toBeInTheDocument();

    fireEvent.click(loopButton());
    expect(instances[0].options.loop).toBe("one");
    expect(loopButton().getAttribute("data-loop-mode")).toBe("one");
    // 单曲循环：带上角标「1」
    expect(loopButton().querySelector(".mp-loop-badge").textContent).toBe("1");

    fireEvent.click(loopButton());
    expect(instances[0].options.loop).toBe("none");
    expect(loopButton().getAttribute("data-loop-mode")).toBe("none");
    expect(loopButton().querySelector(".mp-loop-badge")).not.toBeInTheDocument();

    fireEvent.click(loopButton());
    expect(instances[0].options.loop).toBe("all");
    // 只改 options.loop：不重建实例、不重拉歌单
    expect(instances).toHaveLength(1);
    expect(instances[0].calls.filter((name) => name === "clear")).toHaveLength(1);
  });

  it("进度条：timeupdate 同步时间与滑块，拖动调 APlayer.seek()，切歌归零", async () => {
    render(<MusicPlayer />);
    await waitFor(() => expect(instances[0].list.audios).toHaveLength(PLAYLISTS.spotify.length));

    const range = screen.getByLabelText("播放进度");
    const now = () => document.querySelector("[data-mp-position]").textContent;
    const total = () => document.querySelector("[data-mp-duration]").textContent;
    // 还没有时长：滑块禁用，时长显示占位符
    expect(range).toBeDisabled();
    expect(now()).toBe("0:00");
    expect(total()).toBe("--:--");

    act(() => {
      instances[0].audio.currentTime = 30;
      instances[0].audio.duration = 125;
      instances[0].emit("timeupdate");
    });

    expect(range).toBeEnabled();
    expect(range.max).toBe("125");
    expect(range.value).toBe("30");
    expect(now()).toBe("0:30");
    expect(total()).toBe("2:05");

    fireEvent.change(range, { target: { value: "60" } });
    expect(instances[0].seek).toHaveBeenCalledWith(60);

    // 拖动中：timeupdate 不许把滑块抢回去（否则手感会「跳」）
    fireEvent.mouseDown(range);
    act(() => {
      instances[0].audio.currentTime = 61;
      instances[0].emit("timeupdate");
    });
    expect(range.value).toBe("60");

    fireEvent.mouseUp(range);
    act(() => {
      instances[0].audio.currentTime = 62;
      instances[0].emit("timeupdate");
    });
    expect(range.value).toBe("62");

    // 切歌：进度与时长一起归零
    act(() => instances[0].list.switch(0));
    expect(now()).toBe("0:00");
    expect(total()).toBe("--:--");
  });

  it("音量：标题栏入口展开细滑条，拖动调 APlayer.volume(value, true)", async () => {
    render(<MusicPlayer />);
    await waitFor(() => expect(instances[0].list.audios).toHaveLength(PLAYLISTS.spotify.length));

    expect(document.querySelector("[data-mp-volume]")).not.toBeInTheDocument();

    const toggle = screen.getByLabelText("音量调节");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector("[data-mp-volume]")).toBeInTheDocument();

    const slider = screen.getByLabelText("音量大小");
    // 初值 = 配置里的 volume（0.65）
    expect(slider.value).toBe("65");

    fireEvent.change(slider, { target: { value: "20" } });
    // 第二个参数 true：不写 APlayer 自己的 storage，音量存在我们的 prefs 里
    expect(instances[0].volume).toHaveBeenCalledWith(0.2, true);
    expect(slider.value).toBe("20");

    fireEvent.click(toggle);
    expect(document.querySelector("[data-mp-volume]")).not.toBeInTheDocument();
  });
});

/**
 * 样式契约：jsdom 不解析 src/style.css（CRA 的 jest 不处理 CSS），
 * 但「缩小尺寸 / 下拉层级 / flex 对齐 / 原生控制条隐藏」这几条恰好是本轮改造的重点，
 * 所以这里直接读样式文件做断言，防止以后被随手改回去。
 */
describe("MusicPlayer 样式契约", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");
  /** 取某个选择器到它第一个 `}` 之间的规则体（够用：这几条都是简单规则） */
  const rule = (selector) => {
    const start = css.indexOf(selector);
    expect(start).toBeGreaterThan(-1);
    return css.slice(start, css.indexOf("}", start));
  };

  it("尺寸：面板 264px、唱片 104px（改造前是 372px / 144px）", () => {
    expect(rule(".music-player {")).toContain("--mp-panel-width: 264px");
    expect(rule(".mp-panel {")).toContain("width: var(--mp-panel-width)");
    expect(rule(".mp-stage {")).toContain("--mp-disc: 104px");
  });

  it("下拉选择：自建层叠上下文压过唱机与控制条，胶囊边框 + 吃掉原生外观", () => {
    const picker = rule(".mp-picker {");
    expect(picker).toContain("position: relative");
    expect(picker).toContain("z-index: 5");
    // 唱机 1、控制条 2，都排在它下面
    expect(rule(".mp-stage {")).toContain("z-index: 1");
    expect(rule(".mp-controls {")).toContain("z-index: 2");

    const select = rule(".mp-picker select {");
    expect(select).toContain("appearance: none");
    expect(select).toContain("border-radius: 999px");
    expect(select).toContain("var(--border-strong)");
  });

  it("控制条：flex + center + gap 8px，主按钮实心，进度条是 2px 细线 + 8px 圆点", () => {
    const buttons = rule(".mp-buttons {");
    expect(buttons).toContain("display: flex");
    expect(buttons).toContain("align-items: center");
    expect(buttons).toContain("justify-content: center");
    expect(buttons).toContain("gap: 8px");

    const main = rule(".mp-btn-main {");
    expect(main).toContain("width: 36px");
    expect(main).toContain("background: var(--accent)");
    expect(main).toContain("color: var(--accent-contrast)");

    expect(rule(".mp-range::-webkit-slider-runnable-track {")).toContain("height: 2px");
    expect(rule(".mp-range::-webkit-slider-thumb {")).toContain("width: 8px");
  });

  it("APlayer 原生控制条整条隐藏（由自绘控制条取代）", () => {
    expect(rule(".mp-aplayer .aplayer-info .aplayer-controller {")).toContain(
      "display: none !important"
    );
  });
});

