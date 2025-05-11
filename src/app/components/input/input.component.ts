import {Component, EventEmitter, Input, Output} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';

@Component({
  selector: 'app-location-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './input.component.html',
  styles: []
})
export class InputComponent {
  @Input() startLocation: string = '';
  @Input() endLocation: string = '';
  @Input() travelDate: string = '';
  @Input() returnDate: string = '';
  @Input() tripType: 'oneway' | 'roundtrip' = 'oneway';

  @Output() startLocationChange = new EventEmitter<string>();
  @Output() endLocationChange = new EventEmitter<string>();
  @Output() travelDateChange = new EventEmitter<string>();
  @Output() returnDateChange = new EventEmitter<string>();
  @Output() tripTypeChange = new EventEmitter<'oneway' | 'roundtrip'>();
  @Output() searchLocations = new EventEmitter<void>();

  onStartLocationChange(value: string) {
    this.startLocationChange.emit(value);
  }

  onEndLocationChange(value: string) {
    this.endLocationChange.emit(value);
  }

  onTravelDateChange(value: string) {
    this.travelDateChange.emit(value);
  }

  onReturnDateChange(value: string) {
    this.returnDateChange.emit(value);
  }

  onTripTypeChange(value: 'oneway' | 'roundtrip') {
    this.tripTypeChange.emit(value);
  }

  search() {
    this.searchLocations.emit();
  }
}
