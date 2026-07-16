# 授業キャプチャ

授業中の教材をスマートフォンで撮影し、そのまま送信するシンプルなWebアプリです。

## 画面

- `/`：撮影・送信画面
- `/teacher`：受信した教材の一覧

## Firebaseの初回設定

### 1. 匿名認証を有効にする

Firebaseコンソールの「Authentication」→「Sign-in method」で「匿名」を有効にします。画面上のログイン操作はありませんが、Firebaseへ安全に接続するために内部で匿名認証を使います。

### 2. Firestore DatabaseとStorageを作成する

FirebaseコンソールからFirestore DatabaseとStorageを作成します。

### 3. セキュリティルールを反映する

このリポジトリにある `firestore.rules` と `storage.rules` をFirebaseへ反映します。

```powershell
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy --only firestore:rules,storage
```

プロジェクトを直接指定する場合は、次のコマンドでも反映できます。

```powershell
firebase deploy --only firestore:rules,storage --project homework-submission-site
```

## 環境変数

ローカルでは `.env.example` と同じ項目を `.env.local` に設定します。VercelではProject SettingsのEnvironment Variablesへ同じ項目を登録し、再デプロイします。

## 開発

```powershell
npm install
npm run dev
```

## 利用方法

1. 撮影画面で「カメラで撮影する」を押します。
2. 教材を撮影します。
3. 写真を確認し、「撮り直す」または「この写真を送信する」を選びます。
4. 受信一覧で写真を開き、確認済みにします。

受信一覧にはログインを設けていません。URLを知っている利用者は受信写真を閲覧できます。
