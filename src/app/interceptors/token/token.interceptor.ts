import {HttpInterceptorFn} from '@angular/common/http';
import {AuthService} from "@auth0/auth0-angular";
import {from, switchMap, take} from 'rxjs';
import {inject, LOCALE_ID} from '@angular/core';

export const tokenInterceptor: HttpInterceptorFn = (req, next) => {
  const auth0Service = inject(AuthService);
  const locale = inject(LOCALE_ID);

  return from(auth0Service.idTokenClaims$.pipe(take(1))).pipe(
    switchMap((token) => {
      if (token) {
        const clonedRequest = req.clone({
          setHeaders: {
            "Authorization": `Bearer ${token.__raw}`,
            "Accept-Language": locale,
          },
        });
        return next(clonedRequest);
      }
      return next(req);
    })
  );
};
