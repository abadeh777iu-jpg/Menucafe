# نسخه Cloudflare منوی کافه

این پوشه همان سایت و پنل مدیریت رستوران‌ها را روی **Cloudflare Workers** و دیتابیس **D1** اجرا می‌کند. کد از GitHub خوانده می‌شود و Cloudflare فقط ذخیره‌سازی و اجرا را انجام می‌دهد.

نسخه Python (`server.py`) همچنان در ریشهٔ `aria-menu/` باقی است و تغییری نکرده است. این نسخه همان مسیرها، پیام‌های خطا، کوکی و CSRF، محدودیت ورود و منطق زمان‌بندی و تقویم جلالی را دارد، بنابراین `admin.js`، `app.js` و `menu-data.js` بدون تغییر کار می‌کنند.

## ساختار

| مسیر | کاربرد |
|---|---|
| `src/worker.js` | ورودی Worker: مسیریاب، نشست‌ها، CSRF، محدودیت ورود، API مدیریت و تزریق پیش‌نمایش |
| `src/security.js` | هش رمز عبور با PBKDF2، توکن نشست و کمک‌های امنیتی |
| `src/store.js`، `src/schedule.js`، `src/jalali.js` | دیتابیس، زمان‌بندی تم‌ها و تقویم جلالی |
| `migrations/0001_init.sql` | ساختار جدول‌ها |
| `migrations/0002_seed.sql` | داده‌های اولیهٔ دو رستوران `aria` و `bahar` (خودکار تولید می‌شود، دستی ویرایش نکنید) |
| `wrangler.jsonc` | تنظیمات Worker، D1 و تعداد تکرار هش رمز عبور |
| `scripts/make-owner.mjs` | ساخت حساب مدیر یک رستوران (SQL تولید می‌کند) |
| `scripts/make-restaurant.mjs` | ساخت رستوران جدید (SQL تولید می‌کند) |
| `scripts/build-assets.mjs` | کپی فایل‌های سایت از ریشهٔ `aria-menu/` به `public/` |
| `test/` | تست‌های واحد و تست API |

## پیش‌نیازها

- Node.js نسخهٔ ۲۰ یا بالاتر
- حساب رایگان Cloudflare
- دسترسی به این ریپو در GitHub

## ۱. ساخت دیتابیس D1

داخل این پوشه:

```bash
npm install
npx wrangler login
npx wrangler d1 create menucafe
```

خروجی دستور، یک `database_id` نشان می‌دهد. آن را در `wrangler.jsonc` جایگزین مقدار `00000000-0000-0000-0000-000000000000` کنید. تا این کار انجام نشود، دیپلوی شکست می‌خورد.

سپس migrationها را روی D1 اجرا کنید:

```bash
npm run db:migrate:remote
```

## ۲. اجرای محلی و تست

```bash
npm run build
npm run dev          # روی http://localhost:8787
npm test             # تست‌های واحد و API (هر بار یک Worker و D1 موقت راه می‌اندازد)
```

## ۳. ساخت حساب مدیر رستوران

رمز عبور از ورودی استاندارد خوانده می‌شود و هرگز در خط فرمان یا فایل ذخیره نمی‌شود. رمز باید بین ۱۰ تا ۲۰۰ کاراکتر باشد.

```bash
echo 'رمز-عبور-خیلی-قوی' | node scripts/make-owner.mjs --restaurant aria --username aria.owner > owner-aria.sql
npx wrangler d1 execute menucafe --remote --file owner-aria.sql
rm owner-aria.sql
```

اگر از ویندوز PowerShell استفاده می‌کنید، `echo` رفتار متفاوتی دارد. در آن صورت رمز را داخل یک فایل متنی بگذارید و با `Get-Content` به ورودی بدهید.

برای ساخت رستوران جدید:

```bash
node scripts/make-restaurant.mjs --slug cafe-nila --name "کافه نیلا" --english "Nila Cafe" --theme autumn > r.sql
npx wrangler d1 execute menucafe --remote --file r.sql
rm r.sql
```

نکته: حساب‌های نسخهٔ Python به Cloudflare منتقل نمی‌شوند. باید با `make-owner.mjs` حساب تازه بسازید، چون هش‌های قبلی با تعداد تکرار بالاتری ساخته شده‌اند که Worker قبول نمی‌کند.

## ۴. دیپلوی از GitHub

1. در داشبورد Cloudflare به **Workers & Pages** بروید و **Create** را بزنید.
2. گزینهٔ اتصال به GitHub (Workers Builds) را انتخاب کنید و این ریپو را وصل کنید.
3. تنظیمات build را این‌طور بگذارید:
   - **Root directory:** `aria-menu/cloudflare`
   - **Build command:** `npm run build`
   - **Deploy command:** `npm run deploy` (migrationها را هم اجرا می‌کند؛ اجرای مکرر امن است)
4. بعد از هر push به شاخهٔ اصلی، Cloudflare خودکار دیپلوی می‌کند.

آدرس سایت به شکل `https://menucafe.<زیردامنه>.workers.dev` خواهد بود. پنل مدیریت در `/admin/aria` است.

## تنظیم هزینهٔ هش رمز عبور (تصمیم لازم)

در `wrangler.jsonc` مقدار `PASSWORD_ITERATIONS` برابر `100000` است. این مقدار سقف مجاز Workers است: Web Crypto در Workers برای PBKDF2 بیشتر از ۱۰۰۰۰۰ تکرار را در **همهٔ پلن‌ها** رد می‌کند. کد هم این سقف را اجباری کرده است (`src/security.js`)، پس مقدار بیشتر از آن در پیکربندی باعث خطای شروع Worker می‌شود.

مشکل باقی‌مانده: هر بار بررسی رمز حدود ۲۰ میلی‌ثانیه CPU مصرف می‌کند (اندازه‌گیری تقریبی در محیط Node). پلن رایگان Workers فقط ۱۰ میلی‌ثانیه CPU برای هر درخواست می‌دهد، پس ورود ممکن است روی پلن رایگان گاهی با خطای محدودیت CPU شکست بخورد. گزینه‌ها:

- **پلن Workers Paid** (حدود ۵ دلار در ماه): ورود پایدار با همین امنیت.
- **پلن رایگان با ریسک**: ورود ممکن است گاهی خطا بدهد. با کاهش تعداد تکرار هش امنیت کم می‌شود و توصیه نمی‌شود.

**تصمیم فعلی:** پلن رایگان انتخاب شده است. بعد از دیپلوی، ورود را چند بار امتحان کنید. اگر خطای محدودیت CPU دیدید (پاسخ خطای Cloudflare به جای پیام فارسی سایت)، در Logs داشبورد Cloudflare را بررسی کنید و پلن Paid را در نظر بگیرید.

## امنیت

- رمز عبور و توکن API را هرگز در گفتگو یا فایل‌های Git قرار ندهید. اگر چنین شد، فوراً آن را عوض کنید.
- `owner-*.sql` و `.dev.vars` در `.gitignore` هستند، اما بعد از استفاده حذفشان کنید.
- ورود بعد از ۵ تلاش ناموفق در ۱۵ دقیقه، برای همان نام کاربری از همان IP، موقتاً مسدود می‌شود.
- نشست‌ها ۱۲ ساعت اعتبار دارند. همهٔ نوشتن‌ها به توکن CSRF نیاز دارند.
