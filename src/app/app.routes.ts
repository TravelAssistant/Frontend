import {Routes} from '@angular/router';
import {MapPageComponent} from './components/map-page/map-page.component';
import {TeamSectionComponent} from './components/team-section/team-section.component';
import {ImpressumComponent} from './components/impressum/impressum.component';

export const routes: Routes = [
  {
    component: MapPageComponent,
    path: '',
  },
  {
    component: TeamSectionComponent,
    path: 'team',
  },
  {
    component: ImpressumComponent,
    path: 'impressum',
  },
  {
    component: MapPageComponent,
    path: '**',
  },

];
