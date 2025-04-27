import { Component, ViewChild, AfterViewInit } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule} from '@angular/material/icon';
import { MatSidenavModule, MatSidenavContainer, MatSidenav } from '@angular/material/sidenav';
import { MatListItem, MatNavList } from '@angular/material/list';
import {Router, RouterOutlet, RouterLink} from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import {AuthModule, AuthService } from '@auth0/auth0-angular';

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
    RouterOutlet,
    RouterLink,
    AuthModule,
  ],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent implements AfterViewInit {
  title = 'material-responsive-sidenav';

  @ViewChild(MatSidenav)
  sidenav!: MatSidenav;

  isCollapsed = true;
  isSidenavOpened = false; // <-- hinzugefügt
  isAuthenticated: boolean = false; // Status der Authentifizierung

  constructor(
    private observer: BreakpointObserver,
    public auth: AuthService,
    private router: Router) {}


  ngOnInit() {
    this.auth.isAuthenticated$.subscribe((isAuthenticated) => {
      this.isAuthenticated = isAuthenticated;  // Setze den Authentifizierungsstatus
    });

    this.observer.observe(['(max-width: 800px)']).subscribe((screenSize) => {
      // hier kannst du bei Bedarf später die Sidebar automatisch schließen
    });
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
    this.auth.logout({  }); // Loggt den Benutzer aus und leitet ihn zurück zur Startseite
  }
  goToHome() {
    this.sidenav.close();
    this.router.navigate(['/']);

  }
}
