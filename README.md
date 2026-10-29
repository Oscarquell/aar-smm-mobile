# AZEM Portfolio Admin (iOS / React Native)

Частное мобильное приложение для управления портфолио AZEM. Сделано на React Native + Expo; отдельный проект, не входит в frontend-репозиторий.

## Запуск на Windows через Android-эмулятор

1. Установить Android Studio и пройти стандартный Setup Wizard.
2. В `More Actions → SDK Manager → SDK Platforms` установить Android SDK Platform 37. Во вкладке `SDK Tools` установить Android SDK Build-Tools, Android Emulator и Android SDK Platform-Tools.
3. В `More Actions → Virtual Device Manager → Create Device` создать Pixel-эмулятор и скачать Android system image для него. Запустить эмулятор кнопкой ▶.
4. Установить JDK 17 (не менять JDK 25, который используется для backend; Android-сборку запускать с JDK 17).
5. Открыть PowerShell в папке `mobile-admin`, выполнить `npm install` и затем `npx expo run:android`.

Первая сборка Gradle займёт несколько минут; Expo установит app на открытый эмулятор и запустит dev server. Для последующих запусков достаточно открыть эмулятор и снова выполнить `npx expo run:android`.

Android Studio Emulator нужен для просмотра и проверки React Native интерфейса на Windows. Симулятор iPhone запускается только на Mac с Xcode.

## Сборка на Mac для iPhone

После клонирования отдельного GitHub-репозитория на Mac: `npm install`, затем `npx expo prebuild -p ios`. Открой сгенерированный `ios/*.xcworkspace` в Xcode, выбери подключённый iPhone или симулятор и нажми Run. Если Xcode попросит настроить подпись для устройства, выбери Apple ID в Xcode → Settings → Accounts.

## Безопасность

- API работает по HTTPS; Basic credentials не вшиваются в приложение и хранятся в iOS Keychain через `expo-secure-store`.
- Не коммитить `.env`, пароли, приватные ключи и токены.
- Endpoint и учётные данные передаются только приложением серверу; авторизация остаётся HTTP Basic как в существующей backend-админке.

## Что умеет MVP

- Вход в backend-админку и безопасное сохранение сессии на устройстве.
- Список, создание, редактирование, публикация/снятие с публикации и удаление проектов и кейсов.
- Загрузка фотографий и видео из медиатеки, редактирование alt-текста и порядка, удаление медиа.

SDK/пакеты сверять и устанавливать через `npx expo install`, чтобы Expo выбрал совместимые версии. iOS-проект генерируется Prebuild и обычно не коммитится; на Mac его можно заново получить из `app.json`.
