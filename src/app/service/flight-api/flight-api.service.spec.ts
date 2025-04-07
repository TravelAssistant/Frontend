import { TestBed } from '@angular/core/testing';

import { FlightApiService } from './flight-api.service';

describe('FlightApiService', () => {
  let service: FlightApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FlightApiService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
