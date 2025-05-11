import { Routes } from '@angular/router';
import {ProfileComponent} from './components/profile/profile.component';
import {SelectionComponent} from './components/selection/selection.component';
import {MapPageComponent} from './components/map-page/map-page.component';
import {FlightsComponent} from './components/flights/flights.component';

export const routes: Routes = [
  {
    component: MapPageComponent,
    path: '',
  }
];
