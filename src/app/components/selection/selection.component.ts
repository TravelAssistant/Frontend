import {Component} from '@angular/core';
import {MatFormField, MatLabel} from '@angular/material/form-field';
import {MatOption, MatSelect} from '@angular/material/select';
import {MatButton} from '@angular/material/button';
import {MatInput} from '@angular/material/input';
import {FormsModule} from '@angular/forms';

@Component({
  selector: 'app-selection',
  imports: [
    MatFormField,
    MatSelect,
    MatOption,
    MatButton,
    MatInput,
    MatLabel,
    FormsModule
  ],
  templateUrl: './selection.component.html',
  styleUrl: './selection.component.css'
})
export class SelectionComponent {

  input1: string = '';
  input2: string = '';

  dropdownOptions: string[] = ['Auto', 'Flugzeug', 'Zug'];
  selectedOption: string = this.dropdownOptions[0];

  showAlert(): void {
    alert(`Eingabe 1: ${this.input1}\nEingabe 2: ${this.input2}\nAuswahl: ${this.selectedOption}`);
  }


}
