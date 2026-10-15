# One Fin Software section

The storefront interface is part of the main Next.js application and is served at `/software/`. It uses the main site's header, footer, navigation, and authentication routes; it does not have a separate storefront sign-in or production Railway service.

`src/App.tsx` contains the interactive catalog and template previews. Its stylesheet is scoped to the storefront so it does not alter other pages. Template enquiries are sent to the main site's `/contact` page.

Checkout and project-payment functionality are intentionally not enabled in this migration phase. The former standalone Express server and its `ofs_store` schema are retained as legacy source only; the main site's `/software/` route does not call those APIs.

Run the main site from the repository root:

```sh
npm run dev
npm run build
```
