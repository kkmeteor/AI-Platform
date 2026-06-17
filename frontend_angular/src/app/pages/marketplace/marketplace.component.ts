import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, takeUntil } from 'rxjs';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzPaginationModule } from 'ng-zorro-antd/pagination';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { Skill } from '../../models/skill.model';
import { SkillsService } from '../../services/skills.service';
import { SkillCardComponent } from '../../components/skill-card/skill-card.component';
import { UploadModalComponent } from '../../components/upload-modal/upload-modal.component';

@Component({
  selector: 'app-marketplace',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    NzInputModule,
    NzButtonModule,
    NzGridModule,
    NzSpinModule,
    NzPaginationModule,
    NzEmptyModule,
    NzIconModule,
    SkillCardComponent,
    UploadModalComponent,
  ],
  templateUrl: './marketplace.component.html',
  styleUrls: ['./marketplace.component.css'],
})
export class MarketplaceComponent implements OnInit, OnDestroy {
  skills: Skill[] = [];
  total = 0;
  page = 1;
  pageSize = 12;
  search = '';
  loading = false;
  uploadOpen = false;

  private searchInput$ = new Subject<string>();
  private destroy$ = new Subject<void>();

  constructor(private skillsService: SkillsService) {}

  ngOnInit(): void {
    this.loadData();

    this.searchInput$
      .pipe(
        debounceTime(300),
        takeUntil(this.destroy$),
      )
      .subscribe((value) => {
        this.search = value;
        this.page = 1;
        this.loadData();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.searchInput$.complete();
  }

  loadData(): void {
    this.loading = true;
    this.skillsService
      .fetchSkills({
        search: this.search || undefined,
        page: this.page,
        page_size: this.pageSize,
      })
      .subscribe({
        next: (res) => {
          this.skills = res.items || [];
          this.total = res.total;
        },
        error: () => {
          this.skills = [];
          this.total = 0;
        },
        complete: () => {
          this.loading = false;
        },
      });
  }

  onSearchChange(value: string): void {
    this.searchInput$.next(value);
  }

  onSearch(value: string): void {
    this.search = value;
    this.page = 1;
    this.loadData();
  }

  onPageChange(pageIndex: number): void {
    this.page = pageIndex;
    this.loadData();
  }

  onRefresh(): void {
    this.loadData();
  }

  onUploadSuccess(): void {
    this.loadData();
  }
}
