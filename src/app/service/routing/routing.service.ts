import { Injectable, signal } from '@angular/core';

export interface RouteData {
  startLocation: any;
  endLocation: any;
  transportMode: string;
}

@Injectable({
  providedIn: 'root'
})
export class RoutingService {
  // Create signal with initial null value
  private routeDataSignal = signal<RouteData | null>(null);

  // Expose signal as readonly to prevent external modification
  public routeData = this.routeDataSignal.asReadonly();

  setRouteData(data: RouteData): void {
    this.routeDataSignal.set(data);
  }
}
