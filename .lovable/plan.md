# ساختار آزمون چنددرسی، سازمان و دسته‌بندی درختی

## ۱. وضعیت فعلی (بررسی‌شده، نه حدس)

جدول‌های موجود مرتبط:

- `categories` — تخت (id, name, slug, description, status). بدون والد، بدون سطح.
- `exams` — تک‌دسته‌ای: `category_id`، بدون سازمان، بدون سال/دوره/نوبت، بدون قیمت، بدون meta سئو.
- `exam_categories` — واسط چنددسته‌ای آزمون (موجود).
- `questions` — به `category_id` وصل است (نه به «درس»).
- `question_options` — گزینه‌ها با `is_correct`؛ SELECT فقط برای ادمین، کاندید از طریق RPCهای امن می‌خواند.
- `exam_questions` — (exam_id, question_id, score, display_order) بدون مفهوم درس.
- `exam_attempts` / `attempt_answers` — آزمون‌دهی، با `category_ids` برای انتخاب مبحث.
- RPCها: `save_exam`, `save_question`, `import_questions`, `start_attempt`, `get_attempt_state`, `get_attempt_review`, `submit_attempt`, `get_exam_topics` و RPCهای ادمین/اشتراک.

داده موجود: ۰ آزمون، ۰ شرکت در آزمون، ۱ دسته‌بندی، ۱۵ سؤال. یعنی مهاجرت داده تقریباً بی‌ریسک است، ولی باز هم چیزی حذف نمی‌شود.

## ۲. تغییرات لازم

- دسته‌بندی درختی پویا: افزودن `parent_id` + `display_order` به `categories` (بدون حذف چیزی).
- موجودیت جدید `organizations` (بانک ملت، آموزش‌وپرورش، …).
- موجودیت جدید `subjects` (درس‌ها) — مستقل از `categories`.
- افزودن به `exams`: `organization_id`, `year`, `period`, `round`, `level`, `is_free`, `price`, `meta_title`, `meta_description`, `keywords`.
- جدول واسط `exam_subjects` با `question_count`, `coefficient`, `display_order`, `time_limit_minutes`, `negative_marking` و یکتایی `(exam_id, subject_id)`.
- افزودن `subject_id` به `questions` (nullable، سازگار با گذشته) و `exam_subject_id` به `exam_questions`.
- ایندکس‌های لازم روی کلیدهای فیلتر و اتصال (و نه بیشتر).

هیچ ستون یا جدولی حذف نمی‌شود؛ `category_id` روی `questions`/`exams` باقی می‌ماند تا کد فعلی نشکند.

## ۳. نقشه مهاجرت

یک Migration واحد و backward-compatible:

1. `ALTER TABLE categories` → `parent_id`, `display_order`.
2. `CREATE TABLE organizations`, `subjects` + GRANT + RLS (خواندن عمومی برای موارد فعال، نوشتن فقط ادمین).
3. `ALTER TABLE exams` → فیلدهای سازمان/سال/دوره/نوبت/سطح/قیمت/سئو.
4. `CREATE TABLE exam_subjects` + GRANT + RLS + یکتایی و FK آبشاری.
5. `ALTER TABLE questions ADD subject_id`, `ALTER TABLE exam_questions ADD exam_subject_id`.
6. ایندکس‌ها.
7. RPCهای جدید/به‌روزشده:
   - `save_organization`, `delete_organization`, `save_subject`, `delete_subject`
   - `set_exam_subjects(p_exam_id, p_rows jsonb)` — درج/به‌روزرسانی/حذف درس‌های یک آزمون
   - `save_exam_v2(...)` با فیلدهای جدید (نسخه قدیمی دست‌نخورده می‌ماند)
   - `get_exam_public(p_slug)` و `list_exams_public(filters)` برای فیلتر کاربر بدون افشای پاسخ
   - به‌روزرسانی `get_exam_topics` برای بازگرداندن درس‌ها به‌جای دسته‌بندی وقتی `exam_subjects` پر است.
8. داده نمونه (Seed) با `INSERT` در همان Migration.

## ۴. اثر امنیتی (RLS)

- جدول‌های جدید همگی RLS فعال + GRANT صریح.
- `organizations` و `subjects`: `SELECT` برای `authenticated` روی ردیف‌های فعال؛ نوشتن فقط ادمین.
- `exam_subjects`: خواندن فقط وقتی آزمون منتشرشده است یا کاربر ادمین است؛ نوشتن فقط ادمین.
- `question_options` بدون تغییر باقی می‌ماند: `is_correct` هرگز مستقیم برای کاندید خوانده نمی‌شود و فقط از RPCهای امن پس از Submit برمی‌گردد.
- توابع جدید `SECURITY DEFINER` با `search_path=public` و `EXECUTE` فقط برای `authenticated` (و ادمین‌چک داخلی).
- آزمون‌های `draft`/`private` در RPCهای عمومی فیلتر می‌شوند.

## ۵. مهاجرت داده

- `questions.subject_id` برای رکوردهای موجود `NULL` می‌ماند (۱۵ سؤال) — قابل تخصیص از پنل.
- آزمونی وجود ندارد، پس نیازی به backfill برای `exam_subjects` نیست.
- دسته‌بندی موجود دست‌نخورده در ریشه درخت قرار می‌گیرد (`parent_id = NULL`).

## ۶. کار سمت اپلیکیشن

- `src/routes/_authenticated/organizations.tsx` و `subjects.tsx` — CRUD ساده.
- `categories.tsx` — نمایش/ایجاد درختی با انتخاب والد.
- `exams.tsx` — Wizard چهارمرحله‌ای: اطلاعات پایه → انتخاب درس‌ها → تنظیمات هر درس (تعداد/ضریب/ترتیب/زمان/نمره منفی) → انتخاب سؤال (دستی، تصادفی، بر اساس درس و سطح دشواری).
- `my-exams.tsx` — فیلتر بر اساس دسته، سازمان، سال، درس، سطح، رایگان/پولی + جست‌وجوی متنی.
- منوی ناوبری و `head()` سئو برای صفحات جدید.

## ۷. تست

فایل تست Vitest برای منطق چیدمان درس‌ها و کوئری‌های فیلتر، به‌همراه بررسی‌های یکپارچگی روی دیتابیس (یکتایی درس در آزمون، عدم افشای `is_correct`، پنهان‌بودن آزمون draft).

## ۸. محدودیت‌ها

- ضریب‌ها فعلاً در نمایش و نمره‌دهی `submit_attempt` اعمال می‌شوند فقط اگر آزمون از ساختار جدید استفاده کند؛ آزمون‌های قدیمی مسیر قبلی را حفظ می‌کنند.
- تولید خودکار آزمون تصادفی در مرحله ۴ در سطح انتخاب سؤال است، نه تولید پویا در هر شرکت در آزمون.
