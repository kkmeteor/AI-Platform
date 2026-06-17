import { Component } from '@angular/core';
import { MarketplaceComponent } from './pages/marketplace/marketplace.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [MarketplaceComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent {
  title = 'Skills Market';
}
