import { Component, Input } from '@angular/core';
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

  getTransportIcon(mode: string): string {
    const icons: { [key: string]: string } = {
      'driving': 'directions_car',
      'train': 'train',
      'flight': 'flight',
      'driving-flight': 'flight_takeoff'
    };
    return icons[mode] || 'help_outline';
  }

  getTransportName(mode: string): string {
    const names: { [key: string]: string } = {
      'driving': 'Auto',
      'train': 'Zug/Bus',
      'flight': 'Flugzeug',
      'driving-flight': 'Auto + Flug'
    };
    return names[mode] || mode;
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
}
