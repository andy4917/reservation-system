export function buildIframeStory(path) {
  return function render() {
    const shell = document.createElement("div");
    shell.style.minHeight = "100vh";
    shell.style.background =
      "linear-gradient(180deg, rgba(226,233,240,1) 0%, rgba(241,245,249,1) 100%)";
    shell.style.padding = "16px";

    const meta = document.createElement("div");
    meta.textContent = path;
    meta.style.fontFamily =
      '"Pretendard Variable","Pretendard","SUIT","Noto Sans KR",sans-serif';
    meta.style.fontSize = "12px";
    meta.style.fontWeight = "700";
    meta.style.color = "#475569";
    meta.style.margin = "0 auto 12px";
    meta.style.maxWidth = "1400px";

    const frame = document.createElement("iframe");
    frame.src = path;
    frame.title = path;
    frame.style.width = "100%";
    frame.style.maxWidth = "1400px";
    frame.style.height = "860px";
    frame.style.display = "block";
    frame.style.margin = "0 auto";
    frame.style.border = "1px solid rgba(15, 23, 42, 0.08)";
    frame.style.borderRadius = "20px";
    frame.style.background = "#ffffff";
    frame.style.boxShadow = "0 20px 48px rgba(15, 23, 42, 0.12)";

    shell.append(meta, frame);
    return shell;
  };
}
