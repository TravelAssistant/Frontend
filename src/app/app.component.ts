import {Component} from '@angular/core';
import {AuthService} from '@auth0/auth0-angular';
import {HeaderComponent} from './components/header/header.component';


@Component({
  selector: 'app-root',
  imports: [HeaderComponent],
  templateUrl: './app.component.html',
  standalone: true,
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'Frontend';

  ngOnInit() {
    this.auth.isAuthenticated$.subscribe((isAuthenticated) => {
      if (!isAuthenticated) {
        this.auth.loginWithRedirect()
      }
    });
  }

  constructor( public auth: AuthService) {}
}
