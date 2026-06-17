import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzUploadModule, NzUploadFile } from 'ng-zorro-antd/upload';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { SkillsService } from '../../services/skills.service';

@Component({
  selector: 'app-upload-modal',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    NzModalModule,
    NzFormModule,
    NzInputModule,
    NzUploadModule,
    NzIconModule,
  ],
  templateUrl: './upload-modal.component.html',
  styleUrls: ['./upload-modal.component.css'],
})
export class UploadModalComponent {
  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() uploadSuccess = new EventEmitter<void>();

  form: FormGroup;
  fileList: NzUploadFile[] = [];
  loading = false;

  constructor(
    private fb: FormBuilder,
    private skillsService: SkillsService,
    private message: NzMessageService,
  ) {
    this.form = this.fb.group({
      name: ['', [Validators.required]],
      description: [''],
      author: [''],
      version: [''],
      tags: [''],
    });
  }

  beforeUpload = (): boolean => {
    return false;
  };

  handleOk(): void {
    Object.values(this.form.controls).forEach((control) => {
      control.markAsDirty();
      control.updateValueAndValidity();
    });

    if (this.form.invalid) {
      return;
    }

    if (this.fileList.length === 0) {
      this.message.warning('请上传文件');
      return;
    }

    this.loading = true;
    const values = this.form.value;
    const formData = new FormData();
    formData.append('name', values.name);
    if (values.description) formData.append('description', values.description);
    if (values.author) formData.append('author', values.author);
    if (values.version) formData.append('version', values.version);
    if (values.tags) {
      values.tags.split(',').forEach((tag: string) => {
        const trimmed = tag.trim();
        if (trimmed) formData.append('tags', trimmed);
      });
    }
    const file = this.fileList[0];
    if (file.originFileObj) {
      formData.append('file', file.originFileObj);
    } else {
      formData.append('file', file as any);
    }

    this.skillsService.uploadSkill(formData).subscribe({
      next: () => {
        this.message.success('上传成功');
        this.resetForm();
        this.visibleChange.emit(false);
        this.uploadSuccess.emit();
      },
      error: () => {
        this.message.error('上传失败');
      },
      complete: () => {
        this.loading = false;
      },
    });
  }

  handleCancel(): void {
    this.resetForm();
    this.visibleChange.emit(false);
  }

  private resetForm(): void {
    this.form.reset();
    this.fileList = [];
  }
}
