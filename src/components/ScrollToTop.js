import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { scrollToTop } from "./SmoothScroll";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    // Lenis 接管滚动后，直接 window.scrollTo 会被它按旧位置拉回去，统一走这个封装
    scrollToTop(true);
  }, [pathname]);
  return null;
}

export default ScrollToTop;
