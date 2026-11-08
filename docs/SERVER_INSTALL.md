# Установка на сервер (Ubuntu 22.04/24.04)

Нужны: Node.js 20+ (лучше 22 LTS), PostgreSQL 14+, nginx (по желанию, для HTTPS), домен.

## 1. Пакеты
```bash
sudo apt update && sudo apt install -y postgresql nginx git curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
```

## 2. PostgreSQL
```bash
sudo -u postgres psql <<'SQL'
CREATE USER eldoria WITH PASSWORD 'ВАШ_СЛОЖНЫЙ_ПАРОЛЬ';
CREATE DATABASE eldoria OWNER eldoria;
SQL
```
PostgreSQL должен слушать только localhost (по умолчанию так и есть). Проверка: `psql "postgresql://eldoria:ПАРОЛЬ@127.0.0.1:5432/eldoria" -c "select 1"`.

## 3. Приложение
```bash
sudo useradd -m -s /bin/bash eldoria
sudo -iu eldoria
git clone <URL_ВАШЕГО_РЕПОЗИТОРИЯ> app && cd app
npm ci
cat > .env <<'ENV'
DATABASE_URL=postgresql://eldoria:ВАШ_СЛОЖНЫЙ_ПАРОЛЬ@127.0.0.1:5432/eldoria
ADMIN_LOGINS=ваш_логин
ENV
chmod 600 .env
npx drizzle-kit migrate      # создаёт таблицы; повторный запуск безопасен
npm run build
```

## 4. Автозапуск (systemd)
`/etc/systemd/system/eldoria.service`:
```ini
[Unit]
Description=Eldoria
After=network.target postgresql.service

[Service]
User=eldoria
WorkingDirectory=/home/eldoria/app
EnvironmentFile=/home/eldoria/app/.env
Environment=NODE_ENV=production PORT=3000 HOSTNAME=127.0.0.1
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload && sudo systemctl enable --now eldoria
curl -s http://127.0.0.1:3000/api/health      # {"ok":true}
```

## 5. nginx + HTTPS
`/etc/nginx/sites-available/eldoria`:
```nginx
server {
  server_name example.com;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/eldoria /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx && sudo certbot --nginx -d example.com
```
После включения HTTPS cookie сессии автоматически получает флаг `Secure` (по `X-Forwarded-Proto`).

## 6. Обновление
```bash
sudo -iu eldoria && cd app && git pull && npm ci && npx drizzle-kit migrate && npm run build && exit
sudo systemctl restart eldoria
```
Миграции только добавляют структуру, данные не удаляются.

## 7. Резервные копии
```bash
pg_dump "postgresql://eldoria:ПАРОЛЬ@127.0.0.1:5432/eldoria" | gzip > eldoria_$(date +%F).sql.gz
```

## 8. Проверка после установки
1. `https://example.com/register` → создайте аккаунт → открывается `/game`.
2. Создайте героя, смените причёску, нажмите «Сохранить внешность», обновите страницу — причёска на месте.
3. `sudo systemctl restart eldoria` → вход тем же логином работает (данные в PostgreSQL).
4. Остановите PostgreSQL (`sudo systemctl stop postgresql`) — формы показывают «База данных недоступна», а не фиктивный успех; запустите обратно.

## Замечания
- События мира живут в памяти процесса: запускайте один экземпляр приложения (не кластер).
- Не публикуйте `.env`; пароль БД меняйте при подозрении на утечку.
