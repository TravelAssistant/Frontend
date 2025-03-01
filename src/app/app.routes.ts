import { Routes } from '@angular/router';
import {ProfileComponent} from './components/profile/profile.component';
import {SelectionComponent} from './components/selection/selection.component';

export const routes: Routes = [
  {
    component: ProfileComponent,
    path: '',
  },
  {
    component: SelectionComponent,
    path: 'start',
  }
];
