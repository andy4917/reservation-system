import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";

async function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")));
      }
    );
    request.on("error", reject);
    request.write(JSON.stringify(body));
    request.end();
  });
}

async function main() {
  const root = process.cwd();
  const bridgeServer = await import(path.join(root, "dist-app/main/bridgeServer.js"));

  bridgeServer.__resetBridgeStateForTests();
  const started = await bridgeServer.startBridgeServer(0);
  try {
    await postJson(`http://127.0.0.1:${started.port}/bridge/update`, {
      provider: "naver-partner",
      host: "partner.booking.naver.com",
      url: "https://partner.booking.naver.com/calendar",
      title: "The Seolleung dashboard",
      bodyTextSample: "2026-03-12 Urban 4/6 예약번호 DEB... 객실 A301",
      updatedAt: "2026-03-12T01:00:00.000Z",
      authSummary: null,
      infoSummary: { count: 1, channels: ["NAVER"], dates: ["2026-03-12"] },
      rows: [
        {
          date: "2026-03-12",
          roomType: "Urban",
          channel: "NAVER",
          siteRaw: "4/6",
          sheetRaw: "live-dom",
          reason: "naver DOM row candidate extracted",
          rawLine: "2026-03-12 Urban 4/6 예약번호 DEB... 객실 A301",
          sourceLineIndex: 0,
          candidateBasis: ["date", "ratio", "reservation_ref", "room_no"]
        }
      ]
    });

    const summary = bridgeServer.getLatestBridgeSummary("naver-partner");
    assert.equal(summary.preview?.title, "The Seolleung dashboard");
    assert.equal(summary.preview?.rows.length, 1);
    assert.equal(summary.preview?.rows[0].rawLine?.includes("A301"), true);
    assert.deepEqual(summary.preview?.rows[0].candidateBasis, ["date", "ratio", "reservation_ref", "room_no"]);
  } finally {
    await bridgeServer.stopBridgeServer();
  }

  console.log("regression_app_bridge_preview: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
