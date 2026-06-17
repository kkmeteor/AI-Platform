import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzTypographyModule } from 'ng-zorro-antd/typography';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { Skill } from '../../models/skill.model';
import { SkillsService } from '../../services/skills.service';

@Component({
  selector: 'app-skill-card',
  standalone: true,
  imports: [
    CommonModule,
    NzCardModule,
    NzTagModule,
    NzButtonModule,
    NzPopconfirmModule,
    NzTypographyModule,
    NzIconModule,
    DatePipe,
  ],
  templateUrl: './skill-card.component.html',
  styleUrls: ['./skill-card.component.css'],
})
export class SkillCardComponent {
  @Input() skill!: Skill;
  @Output() refresh = new EventEmitter<void>();

  constructor(
    private skillsService: SkillsService,
    private message: NzMessageService,
  ) {}

  handleDownload(): void {
    this.message.info('文件建议保存到 ~/.qoder/skills/ 目录');
    window.open(this.skillsService.getDownloadUrl(this.skill.id), '_blank');
  }

  handleDelete(): void {
    this.skillsService.deleteSkill(this.skill.id).subscribe({
      next: () => {
        this.message.success('删除成功');
        this.refresh.emit();
      },
      error: () => {
        this.message.error('删除失败');
      },
    });
  }
}
