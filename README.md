# VektorCAD — 專業 2D 工程製圖與 AutoCAD 工作站

全繁體中文介面的網頁版 2D CAD 工程製圖系統，支援物件鎖點 (OSNAP)、正交與極座標追蹤、動態尺寸輸入 (DYN)、圖層管理、指令列與標準 `.DXF` / `.SVG` / `.JSON` 匯出與匯入。

---

## 核心功能

1. **畫直線與幾何繪圖 (`L` / `P` / `R` / `C` / `A` / `E` / `G`)**
   - 支援連續直線段繪製、游標旁動態長度 (`mm`) 與角度 (`∠`) 即時輸入。
   - 按 `F8` 切換正交鎖定 (`ORTHO`)，快速繪製精確水平與垂直結構線。
2. **尺寸標註 (`D` 與 `B`)**
   - **手動兩點標註 (`D`)**：點選任意兩端點並拉出標註線高度。
   - **一鍵智慧自動標註 (`B`)**：選取直線、矩形或圓形後按 `B`，自動生成尺寸標註。
3. **物件鎖點 (`OSNAP F3`)**
   - 自動偵測並吸附：端點 (`□`)、中點 (`△`)、圓心 (`○`)、四分點 (`◇`)、交點 (`×`)。
4. **自動瀏覽器儲存與圖檔匯出**
   - 繪圖進度自動儲存於瀏覽器 `localStorage`，重新整理網頁不會遺失圖面。
   - 支援匯出標準 AutoCAD `.DXF`、向量 `.SVG` 以及 `.JSON` 專案檔。

---

## 如何上傳至 GitHub 並使用 Vercel 部署

### 步驟 1：上傳程式碼至 GitHub
在專案根目錄開啟終端機執行：
```bash
git init
git add .
git commit -m "Initial commit: VektorCAD 2D CAD Studio"
git branch -M main
git remote add origin https://github.com/<您的GitHub帳號>/<您的儲存庫名稱>.git
git push -u origin main
```

### 步驟 2：在 Vercel 一鍵匯入與開啟執行
1. 前往 [Vercel 官網](https://vercel.com/) 並使用 GitHub 帳號登入。
2. 點擊右上角 **Add New...** → **Project**。
3. 找到剛剛上傳的 GitHub 儲存庫，點擊 **Import**。
4. 專案內已附帶 `vercel.json` 與相容的 `package.json` 設定，Vercel 會自動填入：
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. 直接點擊 **Deploy**（無須設定任何環境變數），約 30 秒即可完成部署並取得公開網址！

---

## 本機開發指令

```bash
# 1. 安裝相依套件
npm install

# 2. 啟動開發伺服器 (預設 http://localhost:3000)
npm run dev

# 3. 打包正式版靜態檔案至 dist/
npm run build
```
