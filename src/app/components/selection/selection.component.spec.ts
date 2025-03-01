import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SelectionComponent } from './selection.component';

describe('SelectionComponent', () => {
  let component: SelectionComponent;
  let fixture: ComponentFixture<SelectionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SelectionComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SelectionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
