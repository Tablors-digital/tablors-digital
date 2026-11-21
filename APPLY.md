# Tablor's real authentication - how to apply

1. Copy everything in this zip over your project (same paths). Delete files listed in DELETE_THESE.txt.
2. `npm install`  (adds nodemailer + @testing-library/react)
3. Set env (see .env.example): DATABASE_URL, NEXT_PUBLIC_SITE_URL, GMAIL_USER, GMAIL_APP_PASSWORD,
   SUPER_ADMIN_PASSWORD (and SUPER_ADMIN_EMAIL if different).
4. `npm run db:migrate:safe`   (applies 0007_real_auth_multitenant.sql)
5. `npm run admin:create`      (creates tablor.digital@gmail.com as Super Admin)
6. Existing demo owner/kitchen logins no longer exist. For the demo restaurant ("demo-restaurant"),
   sign in as Super Admin -> Restaurant Management and create owner/kitchen logins for it.
   (Restaurants created from /admin get ids like rst_xxx.)
7. Customer table devices: /customer/<tableId> works as before. /order needs ?r=<restaurantId>,
   /customer/menu needs ?t=<tableId>.
