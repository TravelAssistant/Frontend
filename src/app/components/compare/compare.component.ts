import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

export interface TransportMetrics {
  mode: string;
  distance: number;
  co2Emissions: number;
  cost: number;
  duration?: number;
}

@Component({
  selector: 'app-compare',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './compare.component.html',
  styleUrls: ['./compare.component.css']
})
export class CompareComponent {
  @Input() transportMetrics: TransportMetrics[] = [];
  @Output() transportModeSelected = new EventEmitter<string>();

  getTransportIcon(mode: string): string {
    const icons: { [key: string]: string } = {
      'driving': 'directions_car',
      'train': 'train',
      'driving-flight': 'flight_takeoff'
    };
    return icons[mode] || 'help_outline';
  }

  getTransportName(mode: string): string {
    const names: { [key: string]: string } = {
      'driving': 'Auto',
      'train': 'Zug/Bus',
      'driving-flight': 'Flug'
    };
    return names[mode] || mode;
  }

  getTransportColor(mode: string): string {
    const colors: { [key: string]: string } = {
      'driving': '#3B82F6',  // Blau für Auto
      'train': '#10B981',    // Grün für Zug
      'driving-flight': '#EF4444'    // Rot für Flug
    };
    return colors[mode] || '#9CA3AF'; // Grau als Fallback
  }

  getBestForMetric(metric: 'distance' | 'co2Emissions' | 'cost'): string | null {
    if (!this.transportMetrics.length) return null;

    let bestMode = this.transportMetrics[0].mode;
    let bestValue = this.transportMetrics[0][metric];

    this.transportMetrics.forEach(transport => {
      if (transport[metric] < bestValue) {
        bestValue = transport[metric];
        bestMode = transport.mode;
      }
    });

    return bestMode;
  }

  formatDuration(minutes: number): string {
    if (!minutes) return 'N/A';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}min`;
  }

  // Neue Methode zur Auswahl eines Transportmittels
  selectTransportMode(mode: string): void {
    this.transportModeSelected.emit(mode);
  }
}
