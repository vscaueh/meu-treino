const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Builder, Browser, By, until } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "meu-treino-selenium-"));
process.env.DATA_DIR = testDataDir;
const { server, db } = require("../server");
const evidenceDir = process.env.E2E_SCREENSHOT_DIR || path.join(__dirname, "..", "artifacts", "selenium");
const bravePath = process.env.BRAVE_BIN ||
  (process.platform === "win32" ? "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe" : "");

let driver;
let baseUrl;

async function element(selector) {
  return driver.wait(until.elementLocated(By.css(selector)), 10000);
}

async function waitForText(selector, expected) {
  await driver.wait(async () => (await (await element(selector)).getText()).includes(expected), 10000);
}

async function saveScreenshot(name) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const file = path.join(evidenceDir, name);
  fs.writeFileSync(file, await driver.takeScreenshot(), "base64");
  console.log(`Evidência Selenium: ${file}`);
}

before(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const options = new chrome.Options().addArguments("--headless=new", "--window-size=1440,900");
  if (bravePath && fs.existsSync(bravePath)) options.setChromeBinaryPath(bravePath);
  driver = await new Builder().forBrowser(Browser.CHROME).setChromeOptions(options).build();
  await driver.get(baseUrl);
});

after(async () => {
  if (driver) await driver.quit();
  if (server.listening) await new Promise(resolve => server.close(resolve));
  db.close();
  fs.rmSync(testDataDir, { recursive: true, force: true });
});

test("Selenium: cria conta, entra e mostra o painel", async () => {
  await (await element('[data-auth="register"]')).click();
  await (await element('#auth-form [name="email"]')).sendKeys("selenium@example.test");
  await (await element('#auth-form [name="password"]')).sendKeys("SenhaTeste123");
  await (await element('#auth-submit')).click();
  await waitForText("#toast", "Conta criada");

  await (await element('#auth-form [name="email"]')).sendKeys("selenium@example.test");
  await (await element('#auth-form [name="password"]')).sendKeys("SenhaTeste123");
  await (await element('#auth-submit')).click();
  await driver.wait(until.elementIsVisible(await element("#dashboard")), 10000);
  assert.equal(await (await element("#user-email")).getText(), "selenium@example.test");
  await driver.wait(until.elementIsNotVisible(await element("#toast")), 10000);
  await saveScreenshot("selenium-login.png");
});

test("Selenium: cadastra exercício e ficha pela interface", async () => {
  await (await element('#exercise-form [name="name"]')).sendKeys("Agachamento");
  await (await element('#exercise-form [name="muscleGroup"]')).sendKeys("Pernas");
  await (await element('#exercise-form button[type="submit"]')).click();
  await waitForText("#stat-exercises", "1");
  await waitForText("#exercise-list", "Agachamento");

  await (await element('#plan-form [name="name"]')).sendKeys("Treino A");
  await (await element('#plan-form button[type="submit"]')).click();
  await waitForText("#stat-plans", "1");
  await waitForText("#plan-list", "Treino A");
  await saveScreenshot("selenium-painel.png");
});
