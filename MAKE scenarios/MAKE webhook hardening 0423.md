# MAKE webhook hardening 0423

已產出兩份可匯入藍圖：

- `HPNBHS - New Report Push 0423.json`
- `HPNBHS - New Store Push 0423.json`

## 設計原則

不用 Router，直接走單一路徑加兩層 Filter：

1. `Custom Webhook`
2. `Set variable - request_guard_status`
   Filter: `Allow only POST + valid token`
3. `Set variable - hero_image_url`
   Filter: payload 必填欄位檢查
4. `HTTP - LINE push`

只要任一 Filter 不成立，scenario 會在該模組前停止，不會進入 LINE 推播。

## Filter 設定

### 第一層：只允許 POST + 正確 token

模組：`Set variable - request_guard_status`

Filter 名稱：

- `Allow only POST + valid token`

條件：

- `{{lower(1.method)}}` `text:equal` `post`
- `{{trim(1.token)}}` `text:equal` `__SET_WEBHOOK_TOKEN__`

## 第二層：必要欄位檢查

### 案件通知

模組：`Set variable - hero_image_url`

Filter 名稱：

- `Require report payload fields`

條件：

- `{{length(trim(1.title))}}` `number:greater` `0`
- `{{length(trim(1.cate))}}` `number:greater` `0`

### 特約商店通知

模組：`Set variable - hero_image_url`

Filter 名稱：

- `Require store payload fields`

條件：

- `{{length(trim(1.title))}}` `number:greater` `0`
- `{{length(trim(1.addr))}}` `number:greater` `0`

備註：

- 依目前實際 payload，商店名稱使用 `title`
- 地址使用 `addr`
- 若你之後改成 `store_name` / `address`，請同步改 filter 與 LINE 內容 mapping

## 匯入後要做的事

### 1. 把 token 佔位字串換掉

兩份藍圖目前都先放：

- `__SET_WEBHOOK_TOKEN__`

請改成你的實際 secret，例如：

- `MY_SECRET_TOKEN`

Webhook 呼叫格式：

- `https://hook.make.com/xxxxx?token=MY_SECRET_TOKEN`

### 2. 在 Custom Webhook 設定中確認有開啟 HTTP method 取值

請到 webhook 設定確認：

- `Get request HTTP method` 已開啟

否則 `1.method` 可能不會出現在 bundle 中，第一層 filter 會無法正確判斷。

### 3. 如有需要，重新取樣資料結構

建議用一筆正常的 POST 測一次，包含：

- query `token`
- body 必填欄位

這樣 Make 比較容易在 mapping panel 中顯示完整欄位。

## Webhook Response 建議

最簡單穩定做法：先不要加 `Webhook Response` 模組，讓 Make 保持預設回應即可。

理由：

- 不符合條件時，filter 直接終止，LINE 不會被觸發
- 目前核心目標是擋掉誤推播，不是客製 API 回應
- 少一個 response 分支，維護最簡單

如果之後你想讓外部呼叫端更容易除錯，再考慮加：

- 合法請求：`200`
- method/token/payload 不合法：`400` 或 `403`

但那會比目前版本多一層分流，維護成本也會增加。
