# まなびポスト

スマートフォンのカメラから宿題を撮影し、そのまま提出できる学校向けWebアプリです。教員は課題・生徒別に画像やPDFを確認し、未提出・提出済み・確認済みを管理できます。

## 画面

- `/`：生徒提出画面
- `/teacher`：教員ログイン・管理画面

## Firebaseの初回設定

### 1. Authentication

Firebaseコンソールの「Authentication」→「Sign-in method」で、次の2つを有効にします。

- 匿名（生徒提出用）
- メール／パスワード（教員ログイン用）

### 2. Firestore DatabaseとStorage

FirebaseコンソールからFirestore DatabaseとStorageを作成します。本番運用では、このリポジトリにある `firestore.rules` と `storage.rules` を必ず反映してください。

```powershell
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy --only firestore:rules,storage
```

### 3. 教員アカウント

1. Authenticationの「Users」からメールアドレスとパスワードで教員ユーザーを作成します。
2. 作成したユーザーのUIDをコピーします。
3. Firestoreに `teachers` コレクションを作り、UIDと同じ名前のドキュメントを追加します。
4. ドキュメントには `name` と `email` を文字列で登録します。

`teachers/{UID}` が存在するユーザーだけが教員画面と提出ファイルを閲覧できます。

## 環境変数

ローカルでは `.env.example` と同じ項目を `.env.local` に設定します。VercelではProject SettingsのEnvironment Variablesへ同じ項目を登録し、再デプロイします。

## 開発

```powershell
npm install
npm run dev
```

## 運用の流れ

1. 教員画面の「生徒管理」でクラス・出席番号・名前を登録します。
2. 「課題管理」で課題を作成し、公開状態にします。
3. 生徒はクラス・出席番号・名前を入力して撮影またはファイル選択で提出します。
4. 教員は「提出一覧」で閲覧し、「確認済みにする」を押します。

生徒名簿と提出物は「クラス＋出席番号」で照合されます。
