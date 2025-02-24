import {Component, Inject} from '@angular/core';
import {AsyncPipe, DOCUMENT} from '@angular/common';
import {AuthService} from '@auth0/auth0-angular';
import {RouterOutlet} from '@angular/router';

@Component({
  selector: 'app-profile',
  imports: [AsyncPipe],
  templateUrl: './profile.component.html',
  standalone: true,
  styleUrl: './profile.component.css'
})
export class ProfileComponent {

  constructor(@Inject(DOCUMENT) public document: Document, public auth: AuthService) {}

}
