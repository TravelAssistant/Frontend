import {AfterViewInit, Component, ViewChild} from '@angular/core';
import {MatToolbarModule} from '@angular/material/toolbar';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatSidenav, MatSidenavContainer, MatSidenavModule} from '@angular/material/sidenav';
import {MatListItem, MatNavList} from '@angular/material/list';
import {AuthModule, AuthService} from '@auth0/auth0-angular';
import {RouterModule} from '@angular/router';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatSidenavContainer,
    MatSidenavModule,
    MatNavList,
    MatListItem,
    AuthModule,
    RouterModule
  ],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent implements AfterViewInit {

  @ViewChild(MatSidenav)
  sidenav!: MatSidenav;

  isSidenavOpened = false; // <-- hinzugefügt
  isAuthenticated: boolean = false; // Status der Authentifizierung

  constructor(
    public auth: AuthService) {
  }

  ngAfterViewInit() {
    // Synchronisiere geöffnet/geschlossen-Status
    this.sidenav.openedChange.subscribe((opened: boolean) => {
      this.isSidenavOpened = opened;
    });
  }

  toggleMenu() {
    this.sidenav.toggle();
  }

  login(): void {
    this.auth.loginWithRedirect(); // Leitet den Benutzer zur Auth0-Login-Seite weiter
  }

  logout(): void {
    this.auth.logout({}); // Loggt den Benutzer aus und leitet ihn zurück zur Startseite
  }
}
