// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

/* --------------------------------------------------------------------------
   IntersectionObserver 兜底（jsdom 未实现）
   --------------------------------------------------------------------------
   技能展示区用了 framer-motion 的 whileInView（遮罩浮现）。jsdom 里没有
   IntersectionObserver，framer-motion 会打印
   「IntersectionObserver not available on this device. whileInView animations
   will trigger on mount.」并走降级分支。
   这里补一个最小实现：只记录被观察的元素、不主动派发回调 —— 与真实浏览器里
   「元素尚未进入视口」的状态一致，同时保持测试输出干净。
   -------------------------------------------------------------------------- */
if (typeof global.IntersectionObserver === "undefined") {
  class IntersectionObserverStub {
    constructor() {
      this.elements = new Set();
    }

    observe(element) {
      this.elements.add(element);
    }

    unobserve(element) {
      this.elements.delete(element);
    }

    disconnect() {
      this.elements.clear();
    }

    takeRecords() {
      return [];
    }
  }

  global.IntersectionObserver = IntersectionObserverStub;
  window.IntersectionObserver = IntersectionObserverStub;
}
