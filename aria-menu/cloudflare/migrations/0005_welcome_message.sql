-- Per-restaurant welcome line shown in the notification when a guest opens the menu.
-- Empty means the page uses its own default sentence.
ALTER TABLE restaurants ADD COLUMN welcome_message TEXT NOT NULL DEFAULT '';
UPDATE restaurants SET welcome_message='امروز چه طعمی در سر دارید؟ منوی آریا را با آرامش مرور کنید.' WHERE slug='aria';
UPDATE restaurants SET welcome_message='تازگی بهار منتظر شماست؛ سبزی‌های معطر امروز را ببینید.' WHERE slug='bahar';
