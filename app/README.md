# One Fin Software storefront

This folder contains the standalone template storefront for One Fin Software. It is separate from the main chat application and from the `software/` storefront.

## Local development

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

The development server runs Vite on port 5173.

## Production

```sh
npm run build
npm start
```

The Express server serves the built `dist/` application and supports client-side routes. Set `PORT` in the hosting environment if the platform supplies a port.

## Storefront behavior

- Visitors can browse and preview the available templates.
- The enquiry list is saved in the current browser's local storage.
- Enquiries are sent to the One Fin Solution contact page.
- This storefront does not currently process payments or distribute template downloads.

Template checkout and payment processing are handled separately by the `software/` storefront.
