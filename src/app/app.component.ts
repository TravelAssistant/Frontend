import {Component} from '@angular/core';
import {AuthService} from '@auth0/auth0-angular';
import {RouterOutlet} from '@angular/router';


@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
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
