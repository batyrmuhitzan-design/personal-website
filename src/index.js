import React from "react";
import ReactDOM from "react-dom";
/* ⚠️ 顺序即优先级（CRA 按 import 顺序拼接 CSS）：
   第三方样式（Bootstrap 5 reboot）必须排在自有样式之前。
   它的 body 规则是 `background-color: var(--bs-body-bg)`（#fff）+
   `color: var(--bs-body-color)`（#212529），与 index.css 的 body 规则**同权重**，
   谁在后面谁赢 —— 排在后面时会把换肤变量整个盖掉，
   于是深色主题变成「白底 + #f5f5f5 浅字」= 页面看起来一片空白。 */
import "bootstrap/dist/css/bootstrap.min.css";
import "./index.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";

ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  document.getElementById("root")
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
