import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import {provideAuth0} from '@auth0/auth0-angular';

export const appConfig: ApplicationConfig = {
  providers: [provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAuth0({
      domain: 'dev-4u2jxny8glnhls6d.eu.auth0.com',
      clientId: 'Vto5pBhpugSi309XIvWtGfh6mlWlEitZ',
      authorizationParams: {
        redirect_uri: window.location.origin
      }
    }),
  ]
};
