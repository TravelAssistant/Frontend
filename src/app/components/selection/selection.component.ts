import {Component} from '@angular/core';
import {MatFormField, MatLabel} from '@angular/material/form-field';
import {MatOption, MatSelect} from '@angular/material/select';
import {MatButton} from '@angular/material/button';
import {MatInput} from '@angular/material/input';
import {FormsModule} from '@angular/forms';
import {HttpClient, HttpClientModule} from '@angular/common/http';

@Component({
  selector: 'app-selection',
  imports: [
    MatFormField,
    MatSelect,
    MatOption,
    MatButton,
    MatInput,
    MatLabel,
    FormsModule,
    HttpClientModule
  ],
  templateUrl: './selection.component.html',
  styleUrl: './selection.component.css'
})
export class SelectionComponent {

  constructor(private http: HttpClient) { }

  ngOnInit(): void {
  }


  input1: string = '';
  input2: string = '';
  routeData: any;

  dropdownOptions: string[] = ['Auto', 'Flugzeug', 'Zug'];
  selectedOption: string = this.dropdownOptions[0];

  getRouteData(): void {
    const apiUrl = 'https://164qy48jr1.execute-api.eu-central-1.amazonaws.com/prod/';
    const params = { Start: this.input1, Ziel: this.input2 };

    this.http.get(apiUrl, { params })
      .subscribe(response => {
        this.routeData = response;
        this.showAlert();
      });
  }

  showAlert(): void {
    if (this.routeData) {
      const message = `Strecke: ${this.routeData.Strecke}, CO2: ${this.routeData.CO2}, Preis: ${this.routeData.Preis}`;
      alert(message);
    } else {
      alert('Keine Daten gefunden');
    }
  }



}
