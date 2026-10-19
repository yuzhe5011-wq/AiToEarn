/*
 * @Author: nevin
 * @Date: 2024-08-19 15:58:47
 * @LastEditTime: 2025-03-17 12:41:12
 * @LastEditors: nevin
 * @Description: materialGroup MaterialGroup
 */
import { AccountType, createZodDto, TableDtoSchema } from '@yikart/common'
import { MaterialType } from '@yikart/mongodb'
import { z } from 'zod'

export const MaterialGroupIdSchema = z.object({
  id: z.string().describe('ID'),
})
export class MaterialGroupIdDto extends createZodDto(MaterialGroupIdSchema) {}

export const CreateMaterialGroupSchema = z.object({
  type: z.enum(MaterialType).describe('素材类型'),
  name: z.string().describe('标题'),
  desc: z.string().optional().describe('描述'),
  platforms: z.array(z.enum(AccountType)).optional().default([]).describe('平台限制'),
})
export class CreateMaterialGroupDto extends createZodDto(CreateMaterialGroupSchema) {}

export const UpdateMaterialGroupSchema = z.object({
  name: z.string().describe('标题'),
  desc: z.string().optional().describe('描述'),
  platforms: z.array(z.enum(AccountType)).optional().describe('平台限制'),
})
export class UpdateMaterialGroupDto extends createZodDto(UpdateMaterialGroupSchema) {}

export const MaterialGroupOrderSchema = z.object({
  ids: z.array(z.string().regex(/^[a-f0-9]{24}$/).describe('草稿箱 ID'))
    .min(1)
    .max(1000)
    .refine(ids => new Set(ids).size === ids.length, '草稿箱 ID 不可重复')
    .describe('按期望顺序排列的草稿箱 ID，未包含的草稿箱保留相对顺序并排在后面'),
})
export class MaterialGroupOrderDto extends createZodDto(MaterialGroupOrderSchema) {}

export const MaterialGroupFilterSchema = z.object({
  title: z.string().optional().describe('标题'),
})
export class MaterialGroupFilterDto extends createZodDto(MaterialGroupFilterSchema) {}

export const MaterialGroupListSchema = z.object({
  filter: MaterialGroupFilterSchema.optional().describe('过滤条件'),
  page: TableDtoSchema.describe('分页信息'),
})
export class MaterialGroupListDto extends createZodDto(MaterialGroupListSchema) {}
