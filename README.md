# 日期計算器｜台北市場日曆

手機優先的 GitHub Pages 靜態網站，針對 iPhone 12 Pro Max（428 × 926 CSS px）配置，也能直接在桌機瀏覽。

## 功能

- **起算日期 + 天數**：同時顯示「工作日答案」與「日曆日答案」。
- **起訖日期**：同時顯示工作日天數與日曆日天數。
- **兩種起算規則**：預設不含起算日；可切換含起算日。
- **工作日定義**：週一至週五，排除政府放假日與臺灣證券交易所無交易日。
- **事件提醒**：答案日期或到期日若碰到美國、日本、中國重要宏觀事件，就顯示提醒；起訖模式也會列出區間內事件。
- **PWA**：iPhone Safari 可「加入主畫面」。
- **自動更新**：GitHub Actions 每天更新一次台灣休假／休市與國際財經日曆資料；來源失敗時保留上一版可用資料。

## 資料來源

1. 行政院人事行政總處（DGPA）：政府行政機關辦公日曆。
2. 臺灣證券交易所（TWSE）：市場開休市日期；這一層很重要，因為春節前可能出現「政府仍是平日、股市已無交易」的特殊日期。
3. 華爾街見聞財經日曆：美／日／中經濟數據、央行與政策事件。它是可替換資料層；若其介面改版，計算器本身仍正常工作。

## GitHub Pages 上線（最簡單做法）

1. 在 GitHub 建立一個新 repository，例如 `date-calculator`。
2. 把本資料夾的所有檔案上傳到 repository 根目錄。
3. 進入 **Settings → Pages**。
4. `Build and deployment` 選 **Deploy from a branch**。
5. Branch 選 `main`，Folder 選 `/(root)`，按 **Save**。
6. 等 Pages 顯示公開網址後即可使用。
7. 進入 **Actions**，確認 `Update calendar data` workflow 可執行；第一次也可按 **Run workflow** 手動更新。

> 若 GitHub Actions 無法 push，請至 **Settings → Actions → General → Workflow permissions** 選擇 **Read and write permissions**。

## iPhone 加到主畫面

Safari 打開 GitHub Pages 網址 → 分享 → **加入主畫面**。之後會以接近 App 的獨立畫面啟動。

## 計算規則

### 起算日 + N 天

- **不含起算日（預設）**：起算日不算第 1 天。
- **含起算日**：只有當起算日本身符合該類型時才列為第 1 天；例如工作日模式遇到週末，週末不會被當成第 1 個工作日。

### 起訖日期

- **不含起算日（預設）**：計算「起日之後，到訖日為止」。
- **含起算日**：起日與訖日都納入。

## 維護說明

- `data/taiwan-calendar.json`：台灣政府假日 + TWSE 休市日。
- `data/international-events.json`：國際事件。
- `scripts/update_data.py`：自動更新器。
- `.github/workflows/update-calendar.yml`：每日排程。
- 若國際來源改版，只需更換 `update_wscn()`；前端不必重寫。
