/*
 * Copyright 2024 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { Knex } from 'knex';
import { Logger } from 'winston';
import { roundNumericValues } from '../utils';

export class DatabaseOperations {
  constructor(private readonly knex: Knex, private readonly logger: Logger) {}

  async select(tableName: string, column: string, key: Record<string, string>) {
    try {
      const rows = await this.knex.select(column).from(tableName).where(key);
      this.logger.info(`Data selected successfully ${JSON.stringify(rows)}`);
      return rows;
    } catch (error) {
      this.logger.error('Error selecting data:', error);
      throw error;
    }
  }

  async insert(tableName: string, data: NonNullable<unknown>) {
    //  TODO : Verify data type
    try {
      const insertedRow = await this.knex(tableName)
        .insert(data)
        .returning('*');

      this.logger.debug(`Data inserted successfully ${data}`);
      return insertedRow;
    } catch (error) {
      this.logger.error('Error inserting data:', error);
      throw error; // Re-throw the error for handling further up the call stack
    }
  }

  async insertOverride(
    tableName: string,
    data: NonNullable<unknown>,
    conflictColumn: string,
  ) {
    //  TODO : Verify data type
    await this.knex(tableName)
      .insert(data)
      .onConflict(conflictColumn)
      .merge()
      .then(() => {
        this.logger.info('Data inserted successfully');
      })
      .catch(error => {
        this.logger.error('Error inserting data:', error);
      });
  }

  async update(
    tableName: string,
    data: NonNullable<unknown>,
    key: Record<string, string>,
  ) {
    //  TODO : Verify data type
    await this.knex(tableName)
      .where(key)
      .update(data)
      .then(() => {
        this.logger.info('Data updated successfully');
      })
      .catch(error => {
        this.logger.error('Error updating data:', error);
      });
  }

  async delete(tableName: string, key: Record<string, string>) {
    await this.knex(tableName)
      .returning('*')
      .where(key)
      .del()
      .then(deletedRow => {
        this.logger.info(
          `row deleted successfully: ${JSON.stringify(deletedRow)}`,
        );
        return deletedRow;
      })
      .catch(error => {
        this.logger.error('Error deleting data:', error);
      });
  }

  async truncate(tableName: string) {
    await this.knex(tableName)
      .truncate()
      .catch(error => {
        this.logger.error(`Error truncating table ${tableName}`, error);
      });
  }

  async getTemplateNameByTsId(templateTaskId: string) {
    try {
      const result = await this.knex.raw(
        'SELECT template_name FROM ts_template_time_savings WHERE template_task_id = :templateTaskId LIMIT 1',
        { templateTaskId },
      );
      const rows = result.rows[0].template_name;
      this.logger.info(`Data selected successfully ${JSON.stringify(rows)}`);
      return roundNumericValues(rows);
    } catch (error) {
      this.logger.error('Error selecting data:', error);
      throw error;
    }
  }
  async getStatsByTemplateTaskId(templateTaskId: string) {
    try {
      const result = await this.knex.raw(
        'SELECT sum(time_saved), team FROM ts_template_time_savings WHERE template_task_id = :templateTaskId GROUP BY team',
        { templateTaskId },
      );
      const rows = result.rows;
      this.logger.info(`Data selected successfully ${JSON.stringify(rows)}`);
      return roundNumericValues(rows);
    } catch (error) {
      this.logger.error('Error selecting data:', error);
      throw error;
    }
  }

  async getStatsByTeam(team: string) {
    try {
      const result = await this.knex.raw(
        'SELECT sum(time_saved), template_name from ts_template_time_savings where team = :team group by template_name, team;',
        { team },
      );
      const rows = result.rows;
      this.logger.info(`Data selected successfully ${JSON.stringify(rows)}`);
      return roundNumericValues(rows);
    } catch (error) {
      this.logger.error('Error selecting data:', error);
      throw error;
    }
  }

  async getStatsByRole(role: string) {
    try {
      const result = await this.knex('ts_template_time_savings')
        .sum('time_saved')
        .select('template_name')
        .where('role', role)
        .groupBy('template_name')
        .groupBy('role');

      this.logger.info(`Data selected successfully ${JSON.stringify(result)}`);
      return roundNumericValues(result);
    } catch (error) {
      this.logger.error('Error selecting data:', error);
      throw error;
    }
  }

  async getStatsByTemplate(template: string) {
    try {
      const result = await this.knex.raw(
        'SELECT sum(time_saved), team from ts_template_time_savings where template_name = :template group by template_name, team;',
        { template },
      );
      const rows = result.rows;
      this.logger.info(`Data selected successfully ${JSON.stringify(rows)}`);
      return roundNumericValues(rows);
    } catch (error) {
      this.logger.error('Error selecting data:', error);
      throw error;
    }
  }

  async getAllStats() {
    try {
      const result = await this.knex('ts_template_time_savings')
        .sum('time_saved')
        .select('team', 'role', 'template_name')
        .groupBy('team')
        .groupBy('role')
        .groupBy('template_name');
      this.logger.info(`Data selected successfully ${JSON.stringify(result)}`);
      return roundNumericValues(result);
    } catch (error) {
      this.logger.error('Error selecting data:', error);
      throw error;
    }
  }

  async getGroupSavingsDivision() {
    try {
      const result = await this.knex.raw(`
            SELECT
            CAST(
                ROUND(
                    (SUM(time_saved)::numeric / (SELECT SUM(time_saved)::numeric FROM ts_template_time_savings WHERE ts_template_time_savings.team = team)) * 100,
                    2
                ) AS numeric
            )::numeric AS percentage,
            team
        FROM
            ts_template_time_savings
        GROUP BY
            team;
            `);
      const rows = result.rows;
      this.logger.info(`Data selected successfully ${JSON.stringify(rows)}`);
      return roundNumericValues(rows);
    } catch (error) {
      this.logger.error('Error selecting data:', error);
      throw error;
    }
  }

  async getDailyTimeSummariesTeamWise() {
    try {
      const result = await this.knex.raw(`
            SELECT 
            TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') AS date,
            team,
            SUM(time_saved) AS total_time_saved
          FROM 
            ts_template_time_savings
          GROUP BY 
            TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD'),
            team
          ORDER BY 
            date;
            `);
      const rows = result.rows;
      this.logger.info(`Data selected successfully ${JSON.stringify(rows)}`);
      return roundNumericValues(rows);
    } catch (error) {
      this.logger.error('Error selecting data:', error);
      throw error;
    }
  }

  async getDailyTimeSummariesTemplateWise() {
    try {
      const result = await this.knex.raw(`
            SELECT 
            TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') AS date,
            template_name,
            SUM(time_saved) AS total_time_saved
            FROM 
            ts_template_time_savings
            GROUP BY 
            TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD'),
            template_name
            ORDER BY 
            date;             
            `);
      const rows = result.rows;
      this.logger.info(`Data selected successfully ${JSON.stringify(rows)}`);
      return roundNumericValues(rows);
    } catch (error) {
      this.logger.error('Error selecting data:', error);
      throw error;
    }
  }

  async getTimeSummarySavedTeamWise() {
    try {
      const result = await this.knex.raw(`
          SELECT
            DISTINCT ON (team, TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD')) -- Keep only the first row for each team and day
            TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') AS date,
            team,
            SUM(time_saved) OVER (PARTITION BY team ORDER BY DATE_TRUNC('day', created_at)) AS total_time_saved
          FROM
            ts_template_time_savings
          ORDER BY
            team, TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD'), created_at;
            `);
      const rows = result.rows;
      this.logger.info(`Data selected successfully ${JSON.stringify(rows)}`);
      return roundNumericValues(rows);
    } catch (error) {
      this.logger.error('Error selecting data:', error);
      throw error;
    }
  }

  async getTimeSummarySavedTemplateWise() {
    try {
      const result = await this.knex.raw(`
            SELECT
            DISTINCT ON (template_name, TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD'))
            TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') AS date,
            template_name,
            SUM(time_saved) OVER (PARTITION BY template_name ORDER BY DATE_TRUNC('day', created_at)) AS total_time_saved
            FROM
            ts_template_time_savings
            ORDER BY
            TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD');            
            `);
      const rows = result.rows;
      this.logger.info(`Data selected successfully ${JSON.stringify(rows)}`);
      return roundNumericValues(rows);
    } catch (error) {
      this.logger.error('Error selecting data:', error);
      throw error;
    }
  }

  async getDistinctColumn(tableName: string, column: string) {
    try {
      const result = await this.knex.table(tableName).distinct(column);
      const rows = result;
      this.logger.debug(`Data selected successfully ${JSON.stringify(rows)}`);
      return roundNumericValues(rows);
    } catch (error) {
      this.logger.error('Error selecting data:', error);
      throw error;
    }
  }

  async getTemplateCount() {
    try {
      const result = await this.knex.raw(`
        select count(*) from (select distinct(template_task_id) from ts_template_time_savings ) as unique_templates
        `);
      const rows = result.rows;
      this.logger.debug(`Data selected successfully ${JSON.stringify(rows)}`);
      return roundNumericValues(rows);
    } catch (error) {
      this.logger.error('Error selecting data:', error);
      throw error;
    }
  }
  async getTimeSavedSum(tableName: string, column: string) {
    try {
      const result = await this.knex.table(tableName).sum(column).as('sum');
      const rows = result;
      this.logger.debug(`Data selected successfully ${JSON.stringify(rows)}`);
      return roundNumericValues(rows);
    } catch (error) {
      this.logger.error('Error selecting data:', error);
      throw error;
    }
  }
}
