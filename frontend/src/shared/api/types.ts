import type { components } from './schema'

type S = components['schemas']

export type Campaign = S['CampaignView']
export type CampaignForm = S['CampaignForm']
export type RequestItem = S['Item']
export type Run = S['Run']
export type Delivery = S['DeliveryView']
export type DeliveryStatus = Delivery['status']
export type Group = S['GroupRecord']
export type GroupList = S['GroupList']
export type Settings = S['View']
