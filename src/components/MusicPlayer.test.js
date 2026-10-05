import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import MusicPlayer from "./MusicPlayer";
import profile from "../portfolio.config";

/**
 * 播放器组件测试：
 * APlayer 依赖真实音频环境，这里用一个轻量替身，只保留组件真正调用到的接口
 * （list.add / list.clear / list.switch / play / lrc.show / lrc.hide / on）。
 * 解析服务通过 mock fetch 返回固定榜单，覆盖：
 *   1) 切换平台 → 清空列表 → 载入新榜单 → 自动播放；
 *   2) 点击 ✕ 只隐藏面板（不卸载、不销毁实例），重新展开后歌单与容器都还在；
 *   3) 重新展开时列表为空会自动重新拉取榜单；
 *   4) 点击 ↻ 先清空列表再重新请求当前榜单。
 */
const instances = [];

jest.mock("aplayer", () => {
  class FakePlayer {
    constructor(options) {
      this.options = options;
      this.handlers = {};
      this.calls = [];
      this.audio = { volume: 1, src: "", paused: true };
      this.play = jest.fn(() => {
        this.calls.push("play");
        this.audio.paused = false; // 与真实 audio 一致：开始播放后 paused=false
      });
      // 注意：真实 APlayer 的歌曲数组挂在 list 上（ap.list.audios），替身必须一致
      this.list = {
        audios: [],
        index: 0,
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

    instances[0].list.switch(0);
    instances[0].play(); // 进入「正在播放」状态（audio.paused = false）

    fireEvent.click(screen.getByLabelText("重新加载榜单"));

    await waitFor(() => expect(instances[0].list.audios).toHaveLength(PLAYLISTS.spotify.length));
    await waitFor(() => expect(instances[0].calls.slice(-2)).toEqual(["switch", "play"]));
  });
});
