import fs from "node:fs";
import type { BrowserWindow as ElectronBrowserWindow } from "electron";
import type { AppBranch } from "../../src/desktop/app-v2-contracts.js";

interface WingsCredentials {
  username: string;
  password: string;
}

const BRANCH_LABELS: Record<AppBranch, string> = {
  COEX: "코엑스",
  GANGNAM: "강남",
  SEOLLEUNG: "선릉",
  SAMSEONG: "삼성",
};

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readWingsCredentialsFile() {
  const filePath = normalizeText(process.env.UHS_WINGS_CREDENTIALS_FILE);
  if (!filePath || !fs.existsSync(filePath)) {
    return "";
  }
  return fs.readFileSync(filePath, "utf8");
}

function parseWingsCredentials(text: string, branchHint: AppBranch): WingsCredentials | null {
  const branchLabel = BRANCH_LABELS[branchHint];
  const escapedBranch = branchLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`${escapedBranch}\\s+id\\s*:\\s*([^\\s]+)\\s+password\\s*:\\s*([^\\s]+)`, "i"));
  if (!match) {
    return null;
  }
  return {
    username: normalizeText(match[1]),
    password: normalizeText(match[2]),
  };
}

export async function bootstrapWingsBrowserSession(
  windowRef: ElectronBrowserWindow,
  branchHint?: AppBranch
) {
  if (branchHint == null) {
    return { attempted: false, submitted: false };
  }
  const credentialsText = readWingsCredentialsFile();
  const credentials = parseWingsCredentials(credentialsText, branchHint);
  if (!credentials?.username || !credentials.password) {
    return { attempted: false, submitted: false };
  }

  const payload = JSON.stringify(credentials);
  return windowRef.webContents.executeJavaScript(
    `(() => {
      const creds = ${payload};
      const marker = "__uhsWingsAutoLogin";
      const result = {
        attempted: true,
        submitted: false,
        usernameFilled: false,
        passwordFilled: false
      };
      const usernameInput = document.querySelector('input[type="text"], input[name*="id" i], input[name*="user" i]') || document.querySelector("input");
      const passwordInput = document.querySelector('input[type="password"]');
      if (usernameInput instanceof HTMLInputElement) {
        usernameInput.value = creds.username;
        usernameInput.dispatchEvent(new Event("input", { bubbles: true }));
        usernameInput.dispatchEvent(new Event("change", { bubbles: true }));
        result.usernameFilled = true;
      }
      if (passwordInput instanceof HTMLInputElement) {
        passwordInput.value = creds.password;
        passwordInput.dispatchEvent(new Event("input", { bubbles: true }));
        passwordInput.dispatchEvent(new Event("change", { bubbles: true }));
        result.passwordFilled = true;
      }
      if (result.usernameFilled && result.passwordFilled) {
        const form = (passwordInput instanceof HTMLInputElement && passwordInput.form) || (usernameInput instanceof HTMLInputElement && usernameInput.form);
        const submitTarget =
          (form instanceof HTMLFormElement ? form.querySelector('button[type="submit"], input[type="submit"]') : null) ||
          document.querySelector('button[type="submit"], input[type="submit"], button');
        if (submitTarget instanceof HTMLElement) {
          window[marker] = true;
          submitTarget.click();
          result.submitted = true;
        } else if (form instanceof HTMLFormElement) {
          window[marker] = true;
          form.requestSubmit();
          result.submitted = true;
        }
      }
      return result;
    })()`,
    true
  ) as Promise<{
    attempted: boolean;
    submitted: boolean;
    usernameFilled?: boolean;
    passwordFilled?: boolean;
  }>;
}
