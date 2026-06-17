import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Skill, SkillListResponse, SkillListParams } from '../models/skill.model';

@Injectable({
  providedIn: 'root',
})
export class SkillsService {
  private baseUrl = '/api';

  constructor(private http: HttpClient) {}

  fetchSkills(params: SkillListParams = {}): Observable<SkillListResponse> {
    let httpParams = new HttpParams();
    if (params.search) {
      httpParams = httpParams.set('search', params.search);
    }
    if (params.page) {
      httpParams = httpParams.set('page', params.page.toString());
    }
    if (params.page_size) {
      httpParams = httpParams.set('page_size', params.page_size.toString());
    }
    return this.http.get<SkillListResponse>(`${this.baseUrl}/skills`, { params: httpParams });
  }

  uploadSkill(formData: FormData): Observable<Skill> {
    return this.http.post<Skill>(`${this.baseUrl}/skills`, formData);
  }

  deleteSkill(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/skills/${id}`);
  }

  getDownloadUrl(id: number): string {
    return `${this.baseUrl}/skills/${id}/download`;
  }
}
